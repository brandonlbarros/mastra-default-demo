import { z } from 'zod';
import { createScorer } from '@mastra/core/evals';

/**
 * Evaluates whether the lead scoring workflow selected the right leads for
 * a given ICP and produced actionable summaries.
 *
 * Designed to work both as:
 * 1. An agent scorer (attached to salesAgent.scorers) for live evaluation
 * 2. A dataset experiment scorer for offline batch evaluation against the leadSummaryWorkflow
 *
 * Scoring breakdown:
 *  - 0.35 — selected leads genuinely match the ICP criteria
 *  - 0.35 — fit reasoning is coherent and specific (not generic)
 *  - 0.30 — summaries are actionable (include contact info, angle, pain points)
 */
export const leadFitScorer = createScorer({
  id: 'lead-fit-scorer',
  name: 'Lead Fit Quality',
  description:
    'Evaluates whether the selected leads are the right fit for the ICP and whether summaries are actionable',
  type: 'agent',
  judge: {
    model: 'openai/gpt-5.4-mini',
    instructions:
      'You are an expert B2B sales evaluator. Assess whether a sales AI correctly identified the best leads for a given ICP and whether the summaries give a salesperson everything they need to act.',
  },
})
  .preprocess(({ run }) => {
    // Support both agent runs (run.input/output as CoreMessages) and
    // workflow/scorer experiment runs (run.input/output as plain objects).
    let inputText = '';
    let outputText = '';

    if (Array.isArray(run.input)) {
      // Agent conversation — flatten all user messages
      inputText = run.input
        .filter((m: { role: string }) => m.role === 'user')
        .map((m: { content: unknown }) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        )
        .join('\n');
    } else if (run.input && typeof run.input === 'object') {
      // Workflow run — input is { leads, icp }
      inputText = JSON.stringify(run.input, null, 2);
    }

    if (Array.isArray(run.output)) {
      // Agent output — take the last assistant message
      const last = [...run.output].reverse().find((m: { role: string }) => m.role === 'assistant');
      outputText = last
        ? typeof last.content === 'string'
          ? last.content
          : JSON.stringify(last.content)
        : '';
    } else if (run.output && typeof run.output === 'object') {
      // Workflow output — { summaries: string[] }
      outputText = JSON.stringify(run.output, null, 2);
    } else if (typeof run.output === 'string') {
      outputText = run.output;
    }

    return { inputText, outputText };
  })
  .analyze({
    description: 'Evaluate lead selection quality and summary actionability',
    outputSchema: z.object({
      leadsMatchICP: z.boolean().describe('Selected leads are genuine fits for the stated ICP'),
      reasoningIsSpecific: z
        .boolean()
        .describe('Fit reasoning references concrete ICP criteria, not generic statements'),
      summariesAreActionable: z
        .boolean()
        .describe('Summaries include contact info, pain points, and a clear outreach angle'),
      issues: z.array(z.string()).describe('List of specific problems found, if any'),
      confidence: z.number().min(0).max(1).describe('Evaluator confidence in this assessment'),
    }),
    createPrompt: ({ results }) => `
You are evaluating a B2B sales AI that scores and summarizes leads against an ICP.

INPUT (ICP + raw leads):
"""
${results.preprocessStepResult.inputText}
"""

OUTPUT (selected lead summaries):
"""
${results.preprocessStepResult.outputText}
"""

Evaluate the following — answer true/false for each:

1. leadsMatchICP: Do the selected leads fit the ICP? Consider industry, company size, personas, and pain points alignment. If no ICP is visible in the input, evaluate whether the selected leads seem like strong B2B prospects generally.

2. reasoningIsSpecific: Is the fit reasoning concrete and ICP-specific? (e.g., "matches SaaS target with 50-200 employees and VP Sales persona") vs. vague (e.g., "seems like a good fit").

3. summariesAreActionable: Do the summaries give a salesperson what they need? Check for: contact name + email, company description, pain points, and a suggested outreach angle.

4. issues: List any specific problems found (e.g., "lead X is in a different industry than the ICP", "summaries missing contact email", "all fit reasoning is identical").

5. confidence: How confident are you in this evaluation? (0.0–1.0)

Return valid JSON matching the schema. Be strict and specific.
`,
  })
  .generateScore(({ results }) => {
    const r = results.analyzeStepResult;
    let score = 0;
    if (r.leadsMatchICP) score += 0.35;
    if (r.reasoningIsSpecific) score += 0.35;
    if (r.summariesAreActionable) score += 0.30;
    return Math.min(1, score * (r.confidence ?? 1));
  })
  .generateReason(({ results, score }) => {
    const r = results.analyzeStepResult;
    const parts = [
      `Score: ${score.toFixed(2)}`,
      `Leads match ICP: ${r.leadsMatchICP}`,
      `Reasoning specific: ${r.reasoningIsSpecific}`,
      `Summaries actionable: ${r.summariesAreActionable}`,
      `Confidence: ${r.confidence}`,
    ];
    if (r.issues?.length) {
      parts.push(`Issues: ${r.issues.join('; ')}`);
    }
    return parts.join(' | ');
  });

export const scorers = {
  leadFitScorer,
};
