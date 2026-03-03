import React, { useState, useEffect } from 'react';
import Survey from './Survey.jsx';
import Guide from './Guide.jsx';
import Chat from './Chat.jsx';
import Settings from './Settings.jsx';
import { storage, setPlannerLocale } from '../data/planner.js';
import { hasValidApiKey, getUILocale } from '../data/ai.js';

// 첫 렌더 전에 브라우저 UI 언어로 planner 로케일 맞춤 (서비스 설명 등)
if (typeof getUILocale === 'function') setPlannerLocale(getUILocale());

// 화면 종류: 'survey' | 'guide' | 'settings'
export default function App() {
  const [screen, setScreen] = useState(null); // null = 로딩중
  const [plan, setPlan] = useState(null);
  const [currentTab, setCurrentTab] = useState(null);
  const [activeTab, setActiveTab] = useState('plan'); // 'plan' | 'chat'
  // 가이드 진입 시 API 키 유효 여부 (null=미확인, true/false)
  const [apiKeyValid, setApiKeyValid] = useState(null);

  // 브라우저 UI 언어에 맞춰 planner(서비스 설명 등) 로케일 동기화
  useEffect(() => {
    setPlannerLocale(getUILocale());
  }, []);

  // 초기 로드: plan 있으면 guide, 없으면 설문은 탭에서만 (사이드패널에는 awaiting_survey)
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

  // 다른 탭(설문/가이드 페이지)에서 plan이 저장·삭제되었을 때 사이드패널 화면 자동 전환
  useEffect(() => {
    if (!chrome?.storage?.onChanged) return;

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (!changes.plan) return;

      const nextPlan = changes.plan.newValue || null;
      setPlan(nextPlan);

      if (nextPlan) {
        // 새 플랜이 생기면 자동으로 가이드 화면으로 전환
        setScreen('guide');
      } else {
        // 플랜이 삭제되면 다시 설문 대기 화면으로 전환
        setScreen('awaiting_survey');
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
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
    setScreen('awaiting_survey'); // 사이드패널에는 설문 안 띄움, 전체화면 탭에서만 진행
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
              title={chrome.i18n.getMessage('appSettings')}
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
        {screen === 'awaiting_survey' && (
          <div className="awaiting-survey">
            <p className="awaiting-survey-text">{chrome.i18n.getMessage('awaitingSurveyText')}</p>
            <p className="awaiting-survey-hint">{chrome.i18n.getMessage('awaitingSurveyHint')}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_SURVEY_TAB' })}
            >
              {chrome.i18n.getMessage('openSurveyTab')}
            </button>
          </div>
        )}
        {screen === 'guide' && apiKeyValid === null && (
          <div className="loading guide-key-check">
            <div className="loading-spinner" />
            <p className="guide-key-check-text">{chrome.i18n.getMessage('checkingSettings')}</p>
          </div>
        )}
        {screen === 'guide' && apiKeyValid === false && (
          <div className="guide-key-required">
            <p className="guide-key-required-title">🔑 {chrome.i18n.getMessage('backendRequiredTitle')}</p>
            <p className="guide-key-required-desc">{chrome.i18n.getMessage('backendRequiredDesc')}</p>
            <button type="button" className="btn-primary" onClick={() => setScreen('settings')}>
              {chrome.i18n.getMessage('openSettingsBackend')}
            </button>
          </div>
        )}
        {screen === 'guide' && apiKeyValid === true && (
          <>
            <div className="guide-tabs">
              <button
                type="button"
                className={`guide-tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                onClick={() => setActiveTab('plan')}
              >
                {chrome.i18n.getMessage('tabPlan')}
              </button>
              <button
                type="button"
                className={`guide-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                {chrome.i18n.getMessage('tabChat')}
              </button>
            </div>
            {activeTab === 'plan' ? (
              <Guide
                plan={plan}
                currentTab={currentTab}
                onPlanUpdate={handlePlanUpdate}
                onReset={handleReset}
                onSettings={() => setScreen('settings')}
              />
            ) : (
              <Chat
                plan={plan}
                currentTab={currentTab}
              />
            )}
          </>
        )}
        {screen === 'settings' && (
          <Settings onBack={() => setScreen('guide')} />
        )}
      </main>
    </div>
  );
}
