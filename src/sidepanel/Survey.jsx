import React, { useState } from 'react';
import { getSurveyTools, getStoredAISettings, getUILocale } from '../data/ai.js';
import {
  storage,
  getUniqueServicesFromSelectedTools,
  buildSurveyPayload,
  buildRequirementObjects,
  REQUIREMENT_TO_SERVICE,
  getPlannerMessages,
} from '../data/planner.js';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';
import { Progress } from '../components/ui/progress.jsx';
import { Checkbox } from '../components/ui/checkbox.jsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion.jsx';
import { cn } from '../lib/utils.js';

const TOOL_REVEAL_COUNTS = [5, 7, 9, 10];

function normalizeReqs(reqs) {
  return Array.isArray(reqs) ? reqs.filter(Boolean).map(String) : [];
}

function toolKey(t) {
  const desc = String(t?.description || '').trim().toLowerCase();
  const req = normalizeReqs(t?.requirements).slice().sort().join(',');
  return `${desc}::${req}`;
}

function buildSurveyTools10(tools, locale) {
  const isKo = (locale || 'en').toLowerCase().startsWith('ko');
  const templates = isKo
    ? [
        { description: '로그인·회원가입 받기', requirements: ['login', 'db'] },
        { description: '사진·파일 업로드/관리', requirements: ['storage'] },
        { description: '결제 받기', requirements: ['payment'] },
        { description: '이메일 보내기(알림·공지)', requirements: ['email'] },
        { description: '방문자·이용 현황 보기', requirements: ['analytics'] },
        { description: '문제/오류를 빠르게 감지하기', requirements: ['monitoring'] },
        { description: '글·메뉴 같은 콘텐츠를 쉽게 수정하기', requirements: ['headless-cms'] },
        { description: '웹사이트를 인터넷에 공개하기', requirements: ['frontend-hosting'] },
        { description: '서비스를 안정적으로 운영하기', requirements: ['backend-hosting'] },
      ]
    : [
        { description: 'Let users sign up and log in', requirements: ['login', 'db'] },
        { description: 'Upload and manage photos/files', requirements: ['storage'] },
        { description: 'Accept payments', requirements: ['payment'] },
        { description: 'Send emails (notifications, updates)', requirements: ['email'] },
        { description: 'See visitors and usage', requirements: ['analytics'] },
        { description: 'Detect issues and errors quickly', requirements: ['monitoring'] },
        { description: 'Edit content (posts, menus) easily', requirements: ['headless-cms'] },
        { description: 'Publish your website online', requirements: ['frontend-hosting'] },
        { description: 'Keep your service running reliably', requirements: ['backend-hosting'] },
      ];

  const base = Array.isArray(tools) ? tools : [];
  const out = [];
  const seen = new Set();
  const seenReqSigs = new Set();
  for (const t of base) {
    if (out.length >= 10) break;
    const item = {
      id: Number.isFinite(Number(t?.id)) ? Number(t.id) : null,
      description: String(t?.description || '').trim(),
      requirements: normalizeReqs(t?.requirements),
    };
    if (!item.description) continue;
    const reqSig = item.requirements.slice().sort().join(',');
    const key = toolKey(item);
    if (seen.has(key)) continue;
    out.push(item);
    seen.add(key);
    if (reqSig) seenReqSigs.add(reqSig);
  }

  let maxId = out.reduce((m, t) => (Number.isFinite(Number(t.id)) ? Math.max(m, Number(t.id)) : m), 0);
  for (const tmpl of templates) {
    if (out.length >= 10) break;
    const reqSig = normalizeReqs(tmpl.requirements).slice().sort().join(',');
    if (reqSig && seenReqSigs.has(reqSig)) continue;
    const item = { id: ++maxId, description: tmpl.description, requirements: tmpl.requirements };
    const key = toolKey(item);
    if (seen.has(key)) continue;
    out.push(item);
    seen.add(key);
    if (reqSig) seenReqSigs.add(reqSig);
  }

  const fallbackReqCycle = ['login', 'storage', 'payment', 'email', 'analytics', 'monitoring', 'headless-cms', 'frontend-hosting', 'backend-hosting', 'db'];
  while (out.length < 10) {
    maxId += 1;
    const idx = out.length;
    out.push({
      id: maxId,
      description: isKo ? `추가 기능 ${idx + 1}` : `Extra feature ${idx + 1}`,
      requirements: [fallbackReqCycle[idx % fallbackReqCycle.length]],
    });
  }

  return out.slice(0, 10);
}

/** 아이콘이 이미지 URL이면 <img>, 아니면 텍스트/이모지 렌더 (URL이 텍스트로 안 나오게) */
function ServiceIcon({ icon, className = 'h-4 w-4 object-contain' }) {
  const isUrl = icon && typeof icon === 'string' && /^https?:\/\//i.test(icon.trim());
  if (isUrl) return <img src={icon.trim()} alt="" className={className} />;
  return <>{icon ?? null}</>;
}

export default function Survey({ onComplete }) {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);
  const [showCopiedNotice, setShowCopiedNotice] = useState(false);
  const [toolRevealStage, setToolRevealStage] = useState(0);

  async function handleNext() {
    const text = (siteGoal || '').trim();
    if (!text) return;
    setError(null);
    setSubmitLoading(true);
    try {
      const { backendUrl } = await getStoredAISettings();
      const res = await getSurveyTools(backendUrl, text, getUILocale());
      const tools = res.tools || [];
      if (tools.length === 0) {
        setError(chrome.i18n.getMessage('surveyErrorNoTools'));
        return;
      }
      setAiTools(tools);
      setSelectedToolIds(new Set());
      setToolRevealStage(0);
      setStep(1);
    } catch (e) {
      setError(e.message || chrome.i18n.getMessage('surveyErrorLoad'));
    } finally {
      setSubmitLoading(false);
    }
  }

  function toggleTool(id) {
    setSelectedToolIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleNextFromCheckboxes() {
    setStep(2);
  }

  async function handleGuideStart() {
    const selected = surveyTools.filter(t => selectedToolIds.has(t.id));
    const payload = buildSurveyPayload({ siteGoal: siteGoal.trim(), selectedTools: selected });
    const text = payload?.systemPrompt || '';
    if (text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text).catch(() => {});
      } else {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {}
      }
      setShowCopiedNotice(true);
      setTimeout(() => setShowCopiedNotice(false), 1500);
    }
    await storage.savePlan(payload);
    if (chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: 'https://aistudio.google.com/apps' });
      });
    }
    onComplete(payload);
  }

  const locale = getUILocale();
  const surveyTools = buildSurveyTools10(aiTools, locale);
  const selectedTools = step === 2 ? surveyTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];
  const requirementObjects = step === 2 ? buildRequirementObjects(selectedTools) : [];
  const progressPct = ((step + 1) / 3) * 100;
  const toolVisibleCount = TOOL_REVEAL_COUNTS[Math.min(toolRevealStage, TOOL_REVEAL_COUNTS.length - 1)];
  const visibleSurveyTools = step === 1 ? surveyTools.slice(0, Math.min(toolVisibleCount, surveyTools.length)) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Progress value={progressPct} className="h-1.5 flex-1" />
        <span className="text-[11px] text-muted-foreground">{step + 1} / 3</span>
      </div>

      {step === 0 && (
        <>
          <div className="text-center">
            <h2 className="mb-1 text-sm font-semibold">{chrome.i18n.getMessage('surveyQuestion1')}</h2>
            <p className="text-xs text-muted-foreground">{chrome.i18n.getMessage('surveyHint1')}</p>
          </div>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            placeholder={chrome.i18n.getMessage('surveyPlaceholder')}
            value={siteGoal}
            onChange={e => setSiteGoal(e.target.value)}
            rows={3}
            disabled={submitLoading}
          />
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div className="text-center">
            <h2 className="mb-1 text-sm font-semibold">{chrome.i18n.getMessage('surveyTitleFeatures')}</h2>
            <p className="text-xs text-muted-foreground">{chrome.i18n.getMessage('surveyHintFeatures')}</p>
          </div>
          <div className="flex flex-col gap-2">
            {visibleSurveyTools.map(tool => {
              const selected = selectedToolIds.has(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    selected ? 'border-primary/50 bg-primary/10' : 'border-border bg-card hover:bg-muted/50'
                  )}
                  onClick={() => toggleTool(tool.id)}
                >
                  <Checkbox checked={selected} onCheckedChange={() => toggleTool(tool.id)} className="mt-0.5 shrink-0" />
                  <span className="text-sm font-medium">{tool.description}</span>
                </button>
              );
            })}
          </div>
          {surveyTools.length > toolVisibleCount && toolRevealStage < TOOL_REVEAL_COUNTS.length - 1 && (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setToolRevealStage(s => Math.min(s + 1, TOOL_REVEAL_COUNTS.length - 1))}
                aria-label={locale.toLowerCase().startsWith('ko') ? '기능 더 보기' : 'Show more features'}
              >
                <span aria-hidden>+</span>
                {locale.toLowerCase().startsWith('ko') ? '더 보기' : 'Show more'}
              </Button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="text-center">
            <h2 className="mb-1 text-sm font-semibold">{chrome.i18n.getMessage('surveyTitleServices')}</h2>
            <p className="text-xs text-muted-foreground">{chrome.i18n.getMessage('surveyHintServices')}</p>
          </div>
          <Accordion
            type="single"
            collapsible
            value={expandedServiceId ?? ''}
            onValueChange={v => setExpandedServiceId(v || null)}
            className="space-y-2"
          >
            {uniqueServices.map(s => {
              const desc = getPlannerMessages().serviceDescriptions[s.id];
              const descriptions = requirementObjects
                .filter(ro => REQUIREMENT_TO_SERVICE[ro.requirement]?.id === s.id)
                .flatMap(ro => ro.descriptions || []);
              return (
                <AccordionItem key={s.id} value={s.id} className="rounded-lg border border-border bg-card">
                  <AccordionTrigger className="px-3 py-2.5 text-sm font-medium hover:no-underline">
                    <span className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden">
                      <ServiceIcon icon={s.icon} />
                    </span>
                    {s.name}
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 pt-0">
                    {desc?.summary && <p className="mb-2 text-xs text-foreground">{desc.summary}</p>}
                    {descriptions.length > 0 && (
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        <strong>{chrome.i18n.getMessage('surveyReasonLabel')}</strong>{' '}
                        {[...new Set(descriptions)].join(', ')}
                      </p>
                    )}
                    {desc?.whyNeeded && (
                      <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                        {desc.whyNeeded}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          <Button className="w-full" onClick={handleGuideStart}>
            {showCopiedNotice && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                ✓
              </span>
            )}
            {chrome.i18n.getMessage('surveyBtnStart')}
          </Button>
        </>
      )}

      <div className="flex gap-2 pt-1">
        {step === 0 ? (
          <Button
            className="flex-1"
            disabled={!siteGoal.trim() || submitLoading}
            onClick={handleNext}
          >
            {submitLoading ? chrome.i18n.getMessage('surveyBtnLoading') : chrome.i18n.getMessage('surveyBtnNext')}
          </Button>
        ) : step === 1 ? (
          <>
            <Button variant="secondary" onClick={() => setStep(0)}>
              {chrome.i18n.getMessage('surveyBtnPrev')}
            </Button>
            <Button
              className="flex-1"
              disabled={selectedToolIds.size === 0}
              onClick={handleNextFromCheckboxes}
            >
              {chrome.i18n.getMessage('surveyBtnNext')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
            {chrome.i18n.getMessage('surveyBtnPrev')}
          </Button>
        )}
      </div>
    </div>
  );
}
