import React, { useState } from 'react';
import { Search, FileText, Download, ShieldAlert, X, Sparkles, User, Calendar, MapPin } from 'lucide-react';

const ActionPopovers = ({ activePopover, onClose, onSearch }) => {
  // Form states
  const [researchForm, setResearchForm] = useState({ name: '', year: '', location: '', eventType: 'All' });
  const [holocaustForm, setHolocaustForm] = useState({ name: '', birthDeathYear: '', source: 'All' });
  const [biographyForm, setBiographyForm] = useState({ profileName: '', style: 'Standard' });
  const [fetchProfileForm, setFetchProfileForm] = useState({ wikiTreeId: '' });

  if (!activePopover) return null;

  const handleResearchSubmit = (e) => {
    e.preventDefault();
    if (!researchForm.name.trim()) return;
    
    let prompt = `Search archival records for ${researchForm.name.trim()}`;
    if (researchForm.year.trim()) prompt += ` around year ${researchForm.year.trim()}`;
    if (researchForm.location.trim()) prompt += ` in ${researchForm.location.trim()}`;
    if (researchForm.eventType !== 'All') prompt += ` (event type: ${researchForm.eventType})`;
    prompt += `. Analyze matching OpenArchieven and WikiTree records.`;

    onSearch(prompt);
    setResearchForm({ name: '', year: '', location: '', eventType: 'All' });
    onClose();
  };

  const handleHolocaustSubmit = (e) => {
    e.preventDefault();
    if (!holocaustForm.name.trim()) return;

    let prompt = `Search WWII and Holocaust databases (Joods Monument & Oorlogsbronnen) for ${holocaustForm.name.trim()}`;
    if (holocaustForm.birthDeathYear.trim()) prompt += ` (approx. year ${holocaustForm.birthDeathYear.trim()})`;
    if (holocaustForm.source !== 'All') prompt += ` prioritizing ${holocaustForm.source}`;
    prompt += `. Provide detailed deportation, camp, and biographical records with permanent source citations.`;

    onSearch(prompt);
    setHolocaustForm({ name: '', birthDeathYear: '', source: 'All' });
    onClose();
  };

  const handleBiographySubmit = (e) => {
    e.preventDefault();
    let prompt = biographyForm.profileName.trim() 
      ? `Generate a high-fidelity WikiTree biography for ${biographyForm.profileName.trim()}`
      : `Format a comprehensive WikiTree biography based on the research gathered during this conversation`;

    if (biographyForm.style === 'Holocaust Citations') {
      prompt += `, emphasizing WWII persecution timeline and Joods Monument/Oorlogsbronnen citations`;
    } else if (biographyForm.style === 'Lammertsma Name Study') {
      prompt += `, formatted according to the Lammertsma Name Study guidelines`;
    }
    prompt += `. Return the final biography inside a 'wiki' code block ready to copy to WikiTree.`;

    onSearch(prompt);
    setBiographyForm({ profileName: '', style: 'Standard' });
    onClose();
  };

  const handleFetchProfileSubmit = (e) => {
    e.preventDefault();
    if (!fetchProfileForm.wikiTreeId.trim()) return;

    const prompt = `Read WikiTree profile '${fetchProfileForm.wikiTreeId.trim()}', fetching fresh data and relatives context for research analysis.`;
    onSearch(prompt);
    setFetchProfileForm({ wikiTreeId: '' });
    onClose();
  };

  return (
    <>
      {activePopover === 'research' && (
        <div className="absolute bottom-full mb-3 left-0 z-30 w-full sm:w-[460px] bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Search size={16} className="text-accent-primary" />
              <span>Structured Archive Research</span>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleResearchSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Ancestor Name *</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Aron Cohen or Jan Lammerts"
                  value={researchForm.name}
                  onChange={(e) => setResearchForm({ ...researchForm, name: e.target.value })}
                  autoFocus
                  required
                  className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Year / Range</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. 1890 or 1880-1920"
                    value={researchForm.year}
                    onChange={(e) => setResearchForm({ ...researchForm, year: e.target.value })}
                    className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Location / City</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. Groningen or Den Haag"
                    value={researchForm.location}
                    onChange={(e) => setResearchForm({ ...researchForm, location: e.target.value })}
                    className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Event Type</label>
              <select
                value={researchForm.eventType}
                onChange={(e) => setResearchForm({ ...researchForm, eventType: e.target.value })}
                className="w-full bg-background/80 border border-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
              >
                <option value="All">All Event Types</option>
                <option value="Geboorte">Geboorte (Birth)</option>
                <option value="Huwelijk">Huwelijk (Marriage)</option>
                <option value="Overlijden">Overlijden (Death)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-accent text-on-accent hover:opacity-90 transition-opacity">
                Start Research
              </button>
            </div>
          </form>
        </div>
      )}

      {activePopover === 'holocaust' && (
        <div className="absolute bottom-full mb-3 left-0 z-30 w-full sm:w-[460px] bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
              <ShieldAlert size={16} />
              <span>Holocaust & WWII Research</span>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleHolocaustSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Victim / Subject Name *</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Aron Cohen or Rika van Dam"
                  value={holocaustForm.name}
                  onChange={(e) => setHolocaustForm({ ...holocaustForm, name: e.target.value })}
                  autoFocus
                  required
                  className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Approx. Birth/Death Year</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. 1942 or 1895"
                    value={holocaustForm.birthDeathYear}
                    onChange={(e) => setHolocaustForm({ ...holocaustForm, birthDeathYear: e.target.value })}
                    className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Target Archives</label>
                <select
                  value={holocaustForm.source}
                  onChange={(e) => setHolocaustForm({ ...holocaustForm, source: e.target.value })}
                  className="w-full bg-background/80 border border-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                >
                  <option value="All">All WWII Sources</option>
                  <option value="Joods Monument">Joods Monument Only</option>
                  <option value="Oorlogsbronnen">Oorlogsbronnen Only</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-500 text-white hover:opacity-90 transition-opacity">
                Search Holocaust Records
              </button>
            </div>
          </form>
        </div>
      )}

      {activePopover === 'biography' && (
        <div className="absolute bottom-full mb-3 left-0 z-30 w-full sm:w-[460px] bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText size={16} className="text-accent-primary" />
              <span>WikiTree Biography Generator</span>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleBiographySubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Profile / Ancestor Name (Optional)</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Leave empty to use active research subject"
                  value={biographyForm.profileName}
                  onChange={(e) => setBiographyForm({ ...biographyForm, profileName: e.target.value })}
                  autoFocus
                  className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Formatting Focus</label>
              <select
                value={biographyForm.style}
                onChange={(e) => setBiographyForm({ ...biographyForm, style: e.target.value })}
                className="w-full bg-background/80 border border-border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
              >
                <option value="Standard">Standard WikiTree Biography</option>
                <option value="Holocaust Citations">WWII Timeline & Holocaust Citations</option>
                <option value="Lammertsma Name Study">Lammertsma Name Study Rules</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-accent text-on-accent hover:opacity-90 transition-opacity">
                Generate Biography
              </button>
            </div>
          </form>
        </div>
      )}

      {activePopover === 'fetch_profile' && (
        <div className="absolute bottom-full mb-3 left-0 z-30 w-full sm:w-[400px] bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Download size={16} className="text-accent-primary" />
              <span>Fetch WikiTree Profile</span>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleFetchProfileSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">WikiTree Profile ID *</label>
              <div className="relative">
                <Sparkles size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Lammertsma-1 or Cohen-51688"
                  value={fetchProfileForm.wikiTreeId}
                  onChange={(e) => setFetchProfileForm({ ...fetchProfileForm, wikiTreeId: e.target.value })}
                  autoFocus
                  required
                  className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-accent font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-accent text-on-accent hover:opacity-90 transition-opacity">
                Fetch Profile Data
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default ActionPopovers;
