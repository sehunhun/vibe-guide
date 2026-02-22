import React, { useState, useEffect } from 'react';

const AI_MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', desc: '가장 똑똑함, 비용 중간' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', desc: '빠르고 저렴함' },
];

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
        {saved ? '저장됐어요 ✓' : '저장하기'}
      </button>
    </div>
  );
}
