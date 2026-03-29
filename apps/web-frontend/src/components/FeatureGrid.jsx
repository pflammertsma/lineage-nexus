import React from 'react';
import { Search, Zap, Lock } from 'lucide-react';

const FeatureGrid = () => {
  const features = [
    {
      title: "Lineage",
      description: "Generate detailed biographies with citations without any platform lock-in; easily export to your heritage site of choice.",
      icon: <Search size={24} strokeWidth={2.5} />
    },
    {
      title: "Nexus",
      description: "Our network of hand-crafted agents navigate expansive archives and paper trails to find records a human might miss.",
      icon: <Zap size={24} strokeWidth={2.5} />
    },
    {
      title: "BYOK",
      description: "Bring your own key: Lineage Nexus doesn't store any AI keys—they're only saved in your browser's local storage.",
      icon: <Lock size={24} strokeWidth={2.5} />
    }
  ];

  return (
    <section id="features" className="py-24 bg-surface divider">
      <div className="container">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div key={idx} className="card flex flex-col items-start text-left">
              <div className="text-accent mb-6">
                {feature.icon}
              </div>
              <h3 className="mb-4">{feature.title}</h3>
              <p className="text-secondary text-sm leading-relaxed opacity-90">
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
