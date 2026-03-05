import React, { useState, useEffect } from 'react';
import Survey from './Survey.jsx';
import Guide from './Guide.jsx';
import Chat from './Chat.jsx';
import Settings from './Settings.jsx';
import { Button } from '../components/ui/button.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx';
import { storage, setPlannerLocale } from '../data/planner.js';
import { hasValidApiKey, getUILocale } from '../data/ai.js';

if (typeof getUILocale === 'function') setPlannerLocale(getUILocale());

export default function App() {
  const [screen, setScreen] = useState(null);
  const [plan, setPlan] = useState(null);
  const [currentTab, setCurrentTab] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [apiKeyValid, setApiKeyValid] = useState(null);

  useEffect(() => {
    setPlannerLocale(getUILocale());
  }, []);

  useEffect(() => {
    storage.getPlan().then(savedPlan => {
      if (savedPlan) {
        setPlan(savedPlan);
        setScreen('guide');
      } else {
        setScreen('awaiting_survey');
        chrome.runtime.sendMessage({ type: 'OPEN_SURVEY_TAB' });
      }
    });
  }, []);

  useEffect(() => {
    if (!chrome?.storage?.onChanged) return;
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (!changes.plan) return;
      const nextPlan = changes.plan.newValue || null;
      setPlan(nextPlan);
      if (nextPlan) setScreen('guide');
      else setScreen('awaiting_survey');
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    if (screen !== 'guide') return;
    hasValidApiKey().then(setApiKeyValid);
  }, [screen]);

  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === 'TAB_CHANGED') {
        setCurrentTab({ tabId: msg.tabId, url: msg.url, hostname: msg.hostname });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url && !tab.url.startsWith('chrome://')) {
        try {
          setCurrentTab({
            tabId: tab.id,
            url: tab.url,
            hostname: new URL(tab.url).hostname,
          });
        } catch {}
      }
    });
  }, []);

  const handleSurveyComplete = (newPlan) => {
    setPlan(newPlan);
    setScreen('guide');
  };

  const handleReset = async () => {
    await storage.clearAll();
    setPlan(null);
    setScreen('awaiting_survey');
    chrome.runtime.sendMessage({ type: 'OPEN_SURVEY_TAB' });
  };

  const handlePlanUpdate = (updatedPlan) => {
    setPlan(updatedPlan);
  };

  if (screen === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            UserUse
          </span>
        </div>
        <div className="flex items-center gap-1">
          {screen === 'guide' && (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => setScreen(s => (s === 'settings' ? 'guide' : 'settings'))}
              title={chrome.i18n.getMessage('appSettings')}
              className="text-muted-foreground hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Button>
          )}
        </div>
      </header>

      <main className="app-main">
        {screen === 'survey' && <Survey onComplete={handleSurveyComplete} />}

        {screen === 'awaiting_survey' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {chrome.i18n.getMessage('awaitingSurveyText')}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {chrome.i18n.getMessage('awaitingSurveyHint')}
            </p>
            <Button
              className="w-full"
              onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_SURVEY_TAB' })}
            >
              {chrome.i18n.getMessage('openSurveyTab')}
            </Button>
          </div>
        )}

        {screen === 'guide' && apiKeyValid === null && (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary"
              aria-hidden
            />
            <p className="text-xs text-muted-foreground">
              {chrome.i18n.getMessage('checkingSettings')}
            </p>
          </div>
        )}

        {screen === 'guide' && apiKeyValid === false && (
          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm font-semibold text-foreground">
              {chrome.i18n.getMessage('backendRequiredTitle')}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {chrome.i18n.getMessage('backendRequiredDesc')}
            </p>
            <Button onClick={() => setScreen('settings')}>
              {chrome.i18n.getMessage('openSettingsBackend')}
            </Button>
          </div>
        )}

        {screen === 'guide' && apiKeyValid === true && (
          <>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="tabs-wrapper mb-3 w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="plan">
                  {getUILocale() === 'en'
                    ? 'Plan'
                    : (chrome.i18n.getMessage('tabPlan') || '진행 플랜')}
                </TabsTrigger>
                <TabsTrigger value="chat">
                  {getUILocale() === 'en'
                    ? 'Chat'
                    : (chrome.i18n.getMessage('tabChat') || '채팅')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="plan" className="mt-0 flex flex-1 flex-col gap-3" data-guide-content>
                <Guide
                  plan={plan}
                  currentTab={currentTab}
                  onPlanUpdate={handlePlanUpdate}
                  onReset={handleReset}
                  onSettings={() => setScreen('settings')}
                />
              </TabsContent>
              <TabsContent value="chat" className="mt-0 flex flex-1 flex-col" data-chat-content>
                <Chat plan={plan} currentTab={currentTab} />
              </TabsContent>
            </Tabs>
          </>
        )}

        {screen === 'settings' && (
          <Settings onBack={() => setScreen('guide')} />
        )}
      </main>
    </div>
  );
}
