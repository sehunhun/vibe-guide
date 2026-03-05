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

export default function Survey({ onComplete }) {
  const [step, setStep] = useState(0);
  const [siteGoal, setSiteGoal] = useState('');
  const [aiTools, setAiTools] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState(new Set());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedServiceId, setExpandedServiceId] = useState(null);

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
    const payload = buildSurveyPayload({ siteGoal: siteGoal.trim(), selectedTools: selected });
    await storage.savePlan(payload);
    if (chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { url: 'https://aistudio.google.com/apps' });
      });
    }
    onComplete(payload);
  }

  const selectedTools = step === 2 ? aiTools.filter(t => selectedToolIds.has(t.id)) : [];
  const uniqueServices = step === 2 ? getUniqueServicesFromSelectedTools(selectedTools) : [];
  const requirementObjects = step === 2 ? buildRequirementObjects(selectedTools) : [];
  const progressPct = ((step + 1) / 3) * 100;

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
            {aiTools.map(tool => {
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
                    <span className="mr-2">{s.icon}</span>
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
