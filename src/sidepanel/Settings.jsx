import React, { useState, useEffect } from 'react';

const AI_MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', desc: '가장 똑똑함, 비용 중간' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai', desc: '빠르고 저렴함' },
  { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku', provider: 'anthropic', desc: '빠르고 저렴, 코딩 강점' },
  { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', provider: 'anthropic', desc: '균형잡힌 성능' },
];

export default function Settings({ onBack }) {
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [apiKeys, setApiKeys] = useState({ openai: '', anthropic: '' });
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState({ openai: false, anthropic: false });

  useEffect(() => {
    chrome.storage.local.get(['aiModel', 'apiKeys'], (r) => {
      if (r.aiModel) setSelectedModel(r.aiModel);
      if (r.apiKeys) setApiKeys(r.apiKeys);
    });
  }, []);

  const selectedModelInfo = AI_MODELS.find(m => m.id === selectedModel);
  const requiredProvider = selectedModelInfo?.provider;

  const handleSave = () => {
    chrome.storage.local.set({ aiModel: selectedModel, apiKeys }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <button className="btn-back" onClick={onBack}>← 돌아가기</button>
        <h2>AI 설정</h2>
      </div>

      <div className="settings-section">
        <h3>AI 모델 선택</h3>
        <p className="settings-desc">가이드를 생성할 때 사용할 AI 모델을 선택하세요</p>
        <div className="model-list">
          {AI_MODELS.map(model => (
            <button
              key={model.id}
              className={`model-option ${selectedModel === model.id ? 'selected' : ''}`}
              onClick={() => setSelectedModel(model.id)}
            >
              <div className="model-left">
                <span className="provider-badge">{model.provider === 'openai' ? '🟢' : '🟣'}</span>
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

      <div className="settings-section">
        <h3>API 키</h3>
        <p className="settings-desc">
          선택한 모델({selectedModelInfo?.label})은{' '}
          <strong>{requiredProvider === 'openai' ? 'OpenAI' : 'Anthropic'}</strong> API 키가 필요해요
        </p>

        {/* OpenAI */}
        {requiredProvider === 'openai' && (
          <div className="api-key-field">
            <label>
              OpenAI API Key
              <a
                href="#"
                className="get-key-link"
                onClick={(e) => {
                  e.preventDefault();
                  chrome.tabs.create({ url: 'https://platform.openai.com/api-keys' });
                }}
              >
                키 발급받기 →
              </a>
            </label>
            <div className="input-wrapper">
              <input
                type={showKey.openai ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKeys.openai}
                onChange={e => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
              />
              <button
                className="btn-toggle-key"
                onClick={() => setShowKey(prev => ({ ...prev, openai: !prev.openai }))}
              >
                {showKey.openai ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        )}

        {/* Anthropic */}
        {requiredProvider === 'anthropic' && (
          <div className="api-key-field">
            <label>
              Anthropic API Key
              <a
                href="#"
                className="get-key-link"
                onClick={(e) => {
                  e.preventDefault();
                  chrome.tabs.create({ url: 'https://console.anthropic.com/settings/keys' });
                }}
              >
                키 발급받기 →
              </a>
            </label>
            <div className="input-wrapper">
              <input
                type={showKey.anthropic ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={apiKeys.anthropic}
                onChange={e => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
              />
              <button
                className="btn-toggle-key"
                onClick={() => setShowKey(prev => ({ ...prev, anthropic: !prev.anthropic }))}
              >
                {showKey.anthropic ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        )}

        <p className="key-notice">
          🔒 API 키는 브라우저 로컬에만 저장되며 외부로 전송되지 않아요
        </p>
      </div>

      <button className={`btn-primary btn-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
        {saved ? '저장됐어요 ✓' : '저장하기'}
      </button>
    </div>
  );
}
