import React, { useState, useEffect } from 'react';
import Survey from './Survey.jsx';
import Guide from './Guide.jsx';
import Settings from './Settings.jsx';
import { storage } from '../data/planner.js';
import { hasValidApiKey } from '../data/ai.js';

// 화면 종류: 'survey' | 'guide' | 'settings'
export default function App() {
  const [screen, setScreen] = useState(null); // null = 로딩중
  const [plan, setPlan] = useState(null);
  const [currentTab, setCurrentTab] = useState(null);
  // 가이드 진입 시 API 키 유효 여부 (null=미확인, true/false)
  const [apiKeyValid, setApiKeyValid] = useState(null);

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

  // 가이드 화면일 때 API 키 확인 (설정에서 돌아왔을 때도 재확인)
  useEffect(() => {
    if (screen !== 'guide') return;
    hasValidApiKey().then(setApiKeyValid);
  }, [screen]);

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
    chrome.runtime.sendMessage({ type: 'OPEN_SURVEY_TAB' });
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
          <span className="logo-text">UserUse</span>
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
        {screen === 'guide' && apiKeyValid === null && (
          <div className="loading guide-key-check">
            <div className="loading-spinner" />
            <p className="guide-key-check-text">설정 확인 중...</p>
          </div>
        )}
        {screen === 'guide' && apiKeyValid === false && (
          <div className="guide-key-required">
            <p className="guide-key-required-title">🔑 백엔드 서버 URL이 필요해요</p>
            <p className="guide-key-required-desc">AI 안내를 사용하려면 설정에서 백엔드 서버 URL을 입력해주세요.</p>
            <button type="button" className="btn-primary" onClick={() => setScreen('settings')}>
              설정에서 백엔드 URL 입력하기
            </button>
          </div>
        )}
        {screen === 'guide' && apiKeyValid === true && (
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
