import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ArrowLeft } from 'lucide-react';

const SOURCES = [
  {
    name: 'OpenArchieven',
    domain: 'openarchieven.nl',
    url: 'https://www.openarchieven.nl/',
    description: 'Aggregates millions of birth, marriage, death, and population records from Dutch municipal, provincial, and regional archives.',
  },
  {
    name: 'WikiTree',
    domain: 'wikitree.com',
    url: 'https://www.wikitree.com/',
    description: 'The free, open global family tree connecting ancestors worldwide with strict citation standards and collaborative profile editing.',
  },
  {
    name: 'Netwerk Oorlogsbronnen',
    domain: 'oorlogsbronnen.nl',
    url: 'https://www.oorlogsbronnen.nl/',
    description: 'Connects digital records from hundreds of archives, museums, and research institutes concerning WWII in the Netherlands.',
  },
  {
    name: 'Joods Monument',
    domain: 'joodsmonument.nl',
    url: 'https://www.joodsmonument.nl/',
    description: 'Commemorates the Jewish community in the Netherlands, preserving memories, family connections, and records of victims.',
  },
  {
    name: 'Nationaal Archief',
    domain: 'nationaalarchief.nl',
    url: 'https://www.nationaalarchief.nl/',
    description: 'The central memory of the Netherlands, preserving government archives, passenger manifests, maps, and military registers.',
  },
  {
    name: 'WieWasWie',
    domain: 'wiewaswie.nl',
    url: 'https://www.wiewaswie.nl/',
    description: 'Initiative by CBG Centrum voor familiegeschiedenis providing verified access to official Dutch civil status records.',
  },
];

const SourcesPage = () => {
  return (
    <div className="min-h-[calc(100dvh-var(--h-header))] bg-background text-primary">
      <div className="container py-12 sm:py-16">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-accent transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Home</span>
          </Link>
        </div>

        <div className="max-w-2xl mb-12">
          <h1 className="font-serif text-3xl sm:text-5xl font-semibold tracking-tight mb-4">
            Our Data Sources & Archives
          </h1>
          <p className="text-secondary text-sm sm:text-base leading-relaxed">
            Lineage Nexus searches authoritative public archives, civil registers, and collaborative heritage databases to discover verified records and construct fully cited biographies.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SOURCES.map((source) => (
            <a
              key={source.name}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group card flex flex-col justify-between p-6 bg-surface hover:bg-card border border-border hover:border-accent/40 rounded-2xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center p-1.5 shrink-0 overflow-hidden group-hover:border-accent/30 transition-colors">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`}
                      alt={`${source.name} logo`}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                  <h2 className="text-lg font-bold text-primary group-hover:text-accent transition-colors">
                    {source.name}
                  </h2>
                </div>

                <p className="text-secondary text-xs sm:text-sm leading-relaxed mb-6">
                  {source.description}
                </p>
              </div>

              <div className="pt-4 border-t border-border/60 flex items-center gap-1.5 text-xs text-accent font-medium group-hover:underline">
                <span>{source.domain}</span>
                <ExternalLink size={13} className="shrink-0" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SourcesPage;
