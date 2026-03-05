import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { cn } from '../lib/utils.js';

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
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={onBack}>
          ← {chrome.i18n.getMessage('settingsBack')}
        </Button>
        <h2 className="text-sm font-semibold">{chrome.i18n.getMessage('settingsTitle')}</h2>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{chrome.i18n.getMessage('settingsModelTitle')}</CardTitle>
          <CardDescription className="text-xs">{chrome.i18n.getMessage('settingsModelDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {getAIModels().map(model => (
            <button
              key={model.id}
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
                selectedModel === model.id
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border bg-card hover:bg-muted/50'
              )}
              onClick={() => setSelectedModel(model.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm" aria-hidden>●</span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{model.label}</span>
                  <span className="text-[11px] text-muted-foreground">{model.desc}</span>
                </div>
              </div>
              {selectedModel === model.id && (
                <span className="text-xs font-semibold text-primary">✓</span>
              )}
            </button>
          ))}
        </CardContent>
      </Card>

      <Button
        className={cn('w-full', saved && 'bg-emerald-600 hover:bg-emerald-600')}
        onClick={handleSave}
      >
        {saved ? chrome.i18n.getMessage('settingsSaved') : chrome.i18n.getMessage('settingsSave')}
      </Button>
    </div>
  );
}
