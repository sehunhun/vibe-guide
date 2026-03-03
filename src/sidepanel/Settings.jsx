import React, { useState, useEffect } from 'react';

function getAIModels() {
  return [
    { id: 'gpt-4o', label: chrome.i18n.getMessage('modelGpt4o'), desc: chrome.i18n.getMessage('modelGpt4oDesc') },
    { id: 'gpt-4o-mini', label: chrome.i18n.getMessage('modelGpt4oMini'), desc: chrome.i18n.getMessage('modelGpt4oMiniDesc') },
  ];
}

export default function Settings({ onBack }) {
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['aiModel'], (r) => {
      if (r.aiModel) setSelectedModel(r.aiModel);
    });
  }, []);

  const handleSave = () => {
    chrome.storage.local.set({ aiModel: selectedModel }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <button className="btn-back" onClick={onBack}>← {chrome.i18n.getMessage('settingsBack')}</button>
        <h2>{chrome.i18n.getMessage('settingsTitle')}</h2>
      </div>

      <div className="settings-section">
        <h3>{chrome.i18n.getMessage('settingsModelTitle')}</h3>
        <p className="settings-desc">{chrome.i18n.getMessage('settingsModelDesc')}</p>
        <div className="model-list">
          {getAIModels().map(model => (
            <button
              key={model.id}
              className={`model-option ${selectedModel === model.id ? 'selected' : ''}`}
              onClick={() => setSelectedModel(model.id)}
            >
              <div className="model-left">
                <span className="provider-badge">🟢</span>
                <div>
                  <span className="model-label">{model.label}</span>
                  <span className="model-desc">{model.desc}</span>
                </div>
              </div>
              {selectedModel === model.id && <span className="model-check">✓</span>}
            </button>
          ))}
        </div>
      </div>

      <button className={`btn-primary btn-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
        {saved ? chrome.i18n.getMessage('settingsSaved') + ' ✓' : chrome.i18n.getMessage('settingsSave')}
      </button>
    </div>
  );
}
