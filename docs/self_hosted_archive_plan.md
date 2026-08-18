# Self-Hosted Dutch Archival Engine (OCI Archival Mirror) Implementation Plan

## 1. Overview & Objectives

**Goal**: Replace external HTTP API calls to third-party aggregators (OpenArchieven, WieWasWie) with a dedicated, self-hosted Dutch genealogical search engine deployed on Oracle Cloud Infrastructure (OCI).

**Key Drivers**:
- **Zero Rate Limits**: Bypasses the 2 req/s per-IP throttle imposed by upstream services.
- **Latency Reduction**: Reduces multi-record archival search turns from ~15–30 seconds down to <500 milliseconds.
- **Data Sovereignty**: Custom patronymic expansion, soundex matching, and schema optimization for genealogical research agents.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ Dutch Public Archives (RHCs, Nationaal Archief, Municipalities)        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Bulk Data / OAI-PMH (A2A XML)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Harvester & Normalization Daemon (OCI)                                 │
│  - Parses Archives 2000 (A2A) XML & CSV Dumps                          │
│  - Extracts Person Relations (RelationEP / RelationPP)                 │
│  - Standardizes Dates, Places & Patronymic Variants                    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Bulk Ingest
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ OCI Search Engine (Meilisearch / PostgreSQL + pg_trgm)                 │
│  - ~300M Person Records Indexed                                        │
│  - Sub-10ms Fuzzy & Exact Name/Location Searches                       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Internal REST / gRPC API
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Lineage Nexus Cloud Backend (FastAPI / Gemini Orchestrator)           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Storage & Infrastructure Requirements

- **Hosting Target**: Oracle Cloud Infrastructure (OCI) Ampere A1 (ARM64, 4 OCPU, 24 GB RAM, 300 GB NVMe Storage).
- **Data Volume**: ~250M–350M historical records (Births, Marriages, Deaths, DTB, Population Registers).
- **Storage Footprint**: ~150 GB – 250 GB compressed search index.

---

## 4. Ingestion & Data Pipeline Design

### A. Data Sources & Harvesting Protocols
1. **OAI-PMH Endpoints**: Harvest metadata from participating Dutch Regional Historical Centers (*Regionaal Historisch Centra* / RHCs) via standard OAI-PMH interfaces.
2. **Open Data Dumps**: Pull bulk datasets from [data.overheid.nl](https://data.overheid.nl) and archive portals (e.g. Amsterdam City Archives, Brabants Historisch Informatie Centrum, Tresoar).

### B. Unified Record Schema
```json
{
  "id": "openarch_frl_a6eeff82-7ed3-9fce-6141-06999fe31318",
  "archive_code": "frl",
  "archive_name": "AlleFriezen",
  "record_type": "Geboorte",
  "event_date": "1832-11-22",
  "event_place": "Wijmbritseradeel",
  "province": "Friesland",
  "country": "Nederland",
  "deed_number": "0217",
  "persons": [
    {
      "name": "Murkjen Langeraap",
      "role": "Kind",
      "gender": "Vrouw"
    },
    {
      "name": "Jelle Klazes Langeraap",
      "role": "Vader"
    },
    {
      "name": "Aukjen Symens Visser",
      "role": "Moeder"
    }
  ],
  "permalink": "https://allefriezen.nl/zoeken/deeds/a6eeff82-7ed3-9fce-6141-06999fe31318"
}
```

---

## 5. Phase-by-Phase Execution Roadmap

### Phase 1: Pipeline & Harvester Development
- Write Python OAI-PMH harvester targeting Dutch archive endpoints.
- Implement A2A (Archives 2000) XML parser to extract deed types, roles, and person relationships.
- Create automated deduplication and normalization rules.

### Phase 2: OCI Storage & Search Engine Setup
- Deploy Meilisearch or PostgreSQL + OpenSearch container on OCI.
- Configure Dutch language stop-words and patronymic fuzzy matching indexes.
- Perform initial bulk load of historical datasets.

### Phase 3: Backend Tool Integration
- Create `apps/cloud-backend/tools/archive_mirror.py` module in the cloud backend.
- Swap orchestrator tool dependencies from `open_archives_search` to local OCI search endpoint.
- Verify biography generation and citation output integrity.

### Phase 4: Maintenance & Synchronization
- Configure weekly delta-harvesting cron job to fetch new archival acquisitions.
- Implement system metrics monitoring and uptime alerts.
