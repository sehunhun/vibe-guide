import React, { useState, useEffect } from 'react';
import Survey from './Survey.jsx';
import Guide from './Guide.jsx';
import Settings from './Settings.jsx';
import { storage } from '../data/planner.js';

// 화면 종류: 'survey' | 'guide' | 'settings'
export default function App() {
  const [screen, setScreen] = useState(null); // null = 로딩중
  const [plan, setPlan] = useState(null);
  const [currentTab, setCurrentTab] = useState(null);

  // 초기 로드: 저장된 plan 여부 확인
  useEffect(() => {
    storage.getPlan().then(savedPlan => {
      if (savedPlan) {
        setPlan(savedPlan);
        setScreen('guide');
      } else {
        setScreen('survey');
      }
    });
  }, []);

  // Background → sidePanel: 탭 변경 이벤트 수신
  useEffect(() => {
    const handler = (msg) => {
      if (msg.type === 'TAB_CHANGED') {
        setCurrentTab({ tabId: msg.tabId, url: msg.url, hostname: msg.hostname });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // 현재 탭 초기값 가져오기
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
    setScreen('survey');
  };

  const handlePlanUpdate = (updatedPlan) => {
    setPlan(updatedPlan);
  };

  if (screen === null) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="app">
      {/* 상단 헤더 */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">VibeGuide</span>
        </div>
        <div className="header-actions">
          {screen === 'guide' && (
            <button
              className="btn-icon"
              onClick={() => setScreen(s => s === 'settings' ? 'guide' : 'settings')}
              title="설정"
            >
              ⚙️
            </button>
          )}
        </div>
      </header>

      {/* 콘텐츠 */}
      <main className="app-main">
        {screen === 'survey' && (
          <Survey onComplete={handleSurveyComplete} />
        )}
        {screen === 'guide' && (
          <Guide
            plan={plan}
            currentTab={currentTab}
            onPlanUpdate={handlePlanUpdate}
            onReset={handleReset}
            onSettings={() => setScreen('settings')}
          />
        )}
        {screen === 'settings' && (
          <Settings onBack={() => setScreen('guide')} />
        )}
      </main>
    </div>
  );
}
