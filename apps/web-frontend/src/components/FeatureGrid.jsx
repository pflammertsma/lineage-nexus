import React from 'react';

const FeatureGrid = () => {
  const features = [
    {
      title: "Lineage",
      description: "Generate detailed biographies with citations without any platform lock-in; easily export to your heritage site of choice.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      )
    },
    {
      title: "Nexus",
      description: "Our network of hand-crafted agents navigate expansive archives and paper trails to find records a human might miss.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v8" /><path d="m16 12-4 4-4-4" /><path d="M12 16v6" />
        </svg>
      )
    },
    {
      title: "BYOK",
      description: "Bring your own key: Lineage Nexus doesn't store any AI keys—they're only saved in your browser's local storage.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )
    }
  ];

  return (
    <section id="features" className="py-24 bg-surface divider">
      <div className="container">
        <div className="md:grid-3 flex flex-col gap-8">
          {features.map((feature, idx) => (
            <div key={idx} className="card flex flex-col items-start text-left">
              <div style={{ color: 'var(--accent-primary)', marginBottom: '24px' }}>
                {feature.icon}
              </div>
              <h3 className="mb-4">{feature.title}</h3>
              <p className="text-secondary text-sm leading-relaxed" style={{ opacity: 0.9 }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureGrid;
