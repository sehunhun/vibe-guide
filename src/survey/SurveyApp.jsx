import React, { useState, useEffect } from 'react';
import { getSurveyTools, getStoredAISettings, getUILocale } from '../data/ai.js';
import {
  storage,
  setPlannerLocale,
  getUniqueServicesFromSelectedTools,
  buildSurveyPayload,
  buildRequirementObjects,
  REQUIREMENT_TO_SERVICE,
  getPlannerMessages,
} from '../data/planner.js';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent } from '../components/ui/card.jsx';
import { Progress } from '../components/ui/progress.jsx';
import { Checkbox } from '../components/ui/checkbox.jsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion.jsx';
import { cn } from '../lib/utils.js';

if (typeof getUILocale === 'function') setPlannerLocale(getUILocale());

export default function SurveyApp() {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);

  useEffect(() => {
    setPlannerLocale(getUILocale());
  }, []);

  useEffect(() => {
    storage.getPlan().then(saved => {
      if (saved?.tools?.length) {
        window.location.href = typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('guide.html')
          : '/guide.html';
        return;
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
          aria-hidden
        />
      </div>
    );
  }

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
    const selected = aiTools.filter(t => selectedToolIds.has(t.id));
    const payload = buildSurveyPayload({
      siteGoal: siteGoal.trim(),
      selectedTools: selected,
    });
    await storage.savePlan(payload);
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: 'https://aistudio.google.com/apps' });
      });
    }
    if (typeof chrome !== 'undefined' && chrome.windows && chrome.sidePanel) {
      chrome.windows.getCurrent().then(win => {
        if (win?.id) chrome.sidePanel.open({ windowId: win.id });
      }).catch(() => {
        if (chrome.runtime?.getURL) window.location.href = chrome.runtime.getURL('guide.html');
      });
    } else {
      window.location.href = 'https://aistudio.google.com/apps';
    }
  }

  const selectedTools = step === 2 ? aiTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];
  const requirementObjects = step === 2 ? buildRequirementObjects(selectedTools) : [];
  const progressPct = ((step + 1) / 3) * 100;

  return (
    <div className="survey-page">
      <header className="survey-header">
        <Button
          type="button"
          variant="ghost"
          className="gap-2 px-0 text-base font-semibold hover:bg-transparent"
          onClick={() => setStep(0)}
          aria-label="첫 단계로"
        >
          UserUse
        </Button>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {step + 1} / 3
        </span>
      </header>

      <div className="survey-body">
        <div className="mb-8">
          <Progress value={progressPct} className="h-2" />
        </div>

        {step === 0 && (
          <>
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-xl font-semibold tracking-tight">
                {chrome.i18n.getMessage('surveyQuestion1')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {chrome.i18n.getMessage('surveyHint1')}
              </p>
            </div>
            <div className="mb-6">
              <textarea
                className="min-h-[120px] w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
                placeholder={chrome.i18n.getMessage('surveyPlaceholder')}
                value={siteGoal}
                onChange={e => setSiteGoal(e.target.value)}
                rows={4}
                disabled={submitLoading}
              />
            </div>
            {error && (
              <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-xl font-semibold tracking-tight">
                {chrome.i18n.getMessage('surveyTitleFeatures')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {chrome.i18n.getMessage('surveyHintFeatures')}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {aiTools.map(tool => {
                const sel = selectedToolIds.has(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={cn(
                      'flex items-start gap-4 rounded-lg border px-4 py-3.5 text-left transition-colors',
                      sel ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-muted/50'
                    )}
                    onClick={() => toggleTool(tool.id)}
                  >
                    <Checkbox checked={sel} onCheckedChange={() => toggleTool(tool.id)} className="mt-0.5 shrink-0" />
                    <span className="text-sm font-medium text-foreground">{tool.description}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-xl font-semibold tracking-tight">
                {chrome.i18n.getMessage('surveyTitleServices')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {chrome.i18n.getMessage('surveyHintServices')}
              </p>
            </div>
            <Accordion
              type="single"
              collapsible
              value={expandedServiceId ?? ''}
              onValueChange={v => setExpandedServiceId(v || null)}
              className="mb-6 space-y-2"
            >
              {uniqueServices.map(s => {
                const desc = getPlannerMessages().serviceDescriptions[s.id];
                const descriptions = requirementObjects
                  .filter(ro => REQUIREMENT_TO_SERVICE[ro.requirement]?.id === s.id)
                  .flatMap(ro => ro.descriptions || []);
                return (
                  <AccordionItem key={s.id} value={s.id} className="rounded-lg border border-border bg-card">
                    <AccordionTrigger className="px-4 py-3.5 text-left text-sm font-medium hover:no-underline">
                      <span className="mr-2">{s.icon}</span>
                      {s.name}
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-0">
                      {desc?.summary && (
                        <p className="mb-2 text-sm text-foreground">{desc.summary}</p>
                      )}
                      {descriptions.length > 0 && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          <strong>{chrome.i18n.getMessage('surveyReasonLabel')}</strong>{' '}
                          {[...new Set(descriptions)].join(', ')}
                        </p>
                      )}
                      {desc?.whyNeeded && (
                        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                          {desc.whyNeeded}
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </>
        )}
      </div>

      <footer className="survey-footer">
        {step === 0 && (
          <>
            <Button variant="outline" disabled className="pointer-events-none opacity-50">
              {chrome.i18n.getMessage('surveyBtnPrev')}
            </Button>
            <Button
              className="flex-1"
              disabled={!siteGoal.trim() || submitLoading}
              onClick={handleNext}
            >
              {submitLoading ? chrome.i18n.getMessage('surveyBtnLoading') : chrome.i18n.getMessage('surveyBtnNext')}
            </Button>
          </>
        )}
        {step === 1 && (
          <>
            <Button variant="outline" onClick={() => setStep(0)}>
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
        )}
        {step === 2 && (
          <>
            <Button variant="outline" onClick={() => setStep(1)}>
              {chrome.i18n.getMessage('surveyBtnPrev')}
            </Button>
            <Button className="flex-1" onClick={handleGuideStart}>
              {chrome.i18n.getMessage('surveyBtnStart')}
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}
