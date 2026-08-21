"""
Phase-Weighted ETA Prediction Engine for Meilisearch Batch Ingestion.

Can be imported by the gateway server or executed directly as a CLI tool
against exported JSON telemetry files to simulate and evaluate ETA algorithms.

Usage CLI:
    python eta_engine.py path/to/telemetry.json
"""

import sys
import json
from typing import Any, Dict, List, Optional, Tuple

PHASE_WEIGHTS = {
  "document": 0.05,
  "extracting word proximity": 0.80,
  "post-processing words": 0.80,
  "indexing": 0.12,
  "processing tasks": 0.03,
}

class EtaEngine:
  """Stateful ETA predictor supporting EWMA smoothing and custom phase weights."""

  def __init__(self, phase_weights: Optional[Dict[str, float]] = None, alpha: float = 0.25):
    self.phase_weights = phase_weights or PHASE_WEIGHTS
    self.alpha = alpha
    self._last_ewma_rate: Dict[Any, float] = {}

  def calculate_virtual_progress(self, progress_data: Dict[str, Any]) -> Optional[float]:
    """Converts raw step progress into a phase-weighted virtual progress percentage (0.0 to 100.0)."""
    if not progress_data:
      return 0.0

    steps = progress_data.get("steps") or []
    if not steps:
      pct = progress_data.get("percentage")
      return float(pct) if pct is not None else 0.0

    # If active step is an unquantified engine task like settings updates, progress is indeterminate
    current_step_name = (steps[-1].get("step") or steps[-1].get("currentStep") or "").lower()
    if "settings" in current_step_name or "matrix" in current_step_name:
      return None

    accumulated = 0.0
    for step_info in steps:
      step_name = step_info.get("step") or step_info.get("currentStep") or ""
      finished = step_info.get("finished", 0)
      total = step_info.get("total", 1) or 1
      weight = self.phase_weights.get(step_name, 0.25)

      step_ratio = min(1.0, max(0.0, finished / total))
      accumulated += step_ratio * weight * 100.0

    return min(100.0, max(0.0, round(accumulated, 2)))

  def compute_phase_weighted_eta(
    self, 
    batch_uid: Any, 
    current: Dict[str, Any], 
    elapsed_seconds: float
  ) -> Tuple[Optional[int], Optional[int]]:
    """
    Calculates both phase-weighted EWMA smoothed ETA and naive linear ETA in seconds.
    Returns (smoothed_eta_seconds, naive_eta_seconds).
    """
    if not elapsed_seconds or elapsed_seconds <= 0 or not current:
      return None, None

    steps = current.get("steps") or []
    if not steps:
      return None, None

    current_step_name = (steps[-1].get("step") or steps[-1].get("currentStep") or "").lower()
    if "settings" in current_step_name or "matrix" in current_step_name:
      return None, None

    completed_weight_fraction = 0.0
    for step_info in steps:
      step_name = step_info.get("step") or step_info.get("currentStep") or ""
      finished = step_info.get("finished", 0)
      total = step_info.get("total", 1) or 1
      weight = self.phase_weights.get(step_name, 0.25)
      completed_weight_fraction += (min(1.0, max(0.0, finished / total))) * weight

    remaining_weight_fraction = max(0.0, 1.0 - completed_weight_fraction)
    if remaining_weight_fraction <= 0:
      return 0, 0

    if completed_weight_fraction <= 0:
      return None, None

    instant_rate = completed_weight_fraction / elapsed_seconds
    naive_eta = int(remaining_weight_fraction / instant_rate) if instant_rate > 0 else None

    prev_rate = self._last_ewma_rate.get(batch_uid, instant_rate)
    smoothed_rate = self.alpha * instant_rate + (1.0 - self.alpha) * prev_rate
    self._last_ewma_rate[batch_uid] = smoothed_rate

    smoothed_eta = int(remaining_weight_fraction / smoothed_rate) if smoothed_rate > 0 else naive_eta

    return smoothed_eta, naive_eta


# Helper instances for quick import
_default_engine = EtaEngine()
calculate_virtual_progress = _default_engine.calculate_virtual_progress
compute_phase_weighted_eta = _default_engine.compute_phase_weighted_eta


def simulate_telemetry_file(file_path: str):
  """Simulates ETA calculations against an exported JSON telemetry file."""
  with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

  samples = data if isinstance(data, list) else data.get("samples", [])
  if not samples:
    print(f"No samples found in {file_path}")
    return

  engine = EtaEngine()
  print(f"\n--- Simulating ETA Engine on {len(samples)} samples from '{file_path}' ---")
  print(f"{'Sample':<6} | {'Batch':<6} | {'Elapsed':<8} | {'Raw %':<7} | {'Virt %':<7} | {'Naive ETA':<10} | {'Smoothed ETA':<12}")
  print("-" * 75)

  for i, sample in enumerate(samples, 1):
    batch_uid = sample.get("batch_uid", "unknown")
    elapsed = sample.get("elapsed_seconds", 0)
    raw_pct = sample.get("raw_progress_pct", 0)

    progress_payload = {
      "percentage": raw_pct,
      "steps": sample.get("steps") or [],
    }

    virt_pct = engine.calculate_virtual_progress(progress_payload)
    smoothed_eta, naive_eta = engine.compute_phase_weighted_eta(batch_uid, progress_payload, elapsed)

    s_eta_str = f"{smoothed_eta}s" if smoothed_eta is not None else "—"
    n_eta_str = f"{naive_eta}s" if naive_eta is not None else "—"

    print(f"{i:<6} | {batch_uid:<6} | {elapsed:<8}s | {raw_pct:<7.2f} | {virt_pct:<7.2f} | {n_eta_str:<10} | {s_eta_str:<12}")

  print("-" * 75 + "\n")


if __name__ == "__main__":
  if len(sys.argv) > 1:
    simulate_telemetry_file(sys.argv[1])
  else:
    print("Usage: python eta_engine.py <path_to_telemetry.json>")
