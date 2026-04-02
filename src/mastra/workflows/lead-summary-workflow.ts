import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

export const leadSchema = z.object({
  company_name: z.string(),
  contact_name: z.string(),
  contact_email: z.string(),
  job_title: z.string(),
  industry: z.string(),
  company_size: z.string(),
  annual_revenue: z.string().optional(),
  location: z.string().optional(),
  company_description: z.string(),
  pain_points: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

export const icpSchema = z.object({
  target_industries: z.string(),
  target_company_size: z.string(),
  target_locations: z.string().optional(),
  pain_points: z.string(),
  ideal_deal_size: z.string().optional(),
  key_personas: z.string(),
  other_criteria: z.string().optional(),
});

const topLeadSchema = leadSchema.extend({
  fit_score: z.enum(['High', 'Medium']),
  fit_reasoning: z.string(),
});

export type Lead = z.infer<typeof leadSchema>;
export type ICP = z.infer<typeof icpSchema>;
export type TopLead = z.infer<typeof topLeadSchema>;

const scoreAndSelect = createStep({
  id: 'score-and-select',
  description: 'Scores all leads against the ICP and selects the top 3',
  inputSchema: z.object({
    leads: z.array(leadSchema),
    icp: icpSchema,
  }),
  outputSchema: z.object({
    topLeads: z.array(topLeadSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const { leads, icp } = inputData;

    const agent = mastra?.getAgent('salesAgent');
    if (!agent) {
      throw new Error('Sales agent not found');
    }

    const response = await agent.generate([
      {
        role: 'user',
        content: `You are scoring sales leads against an Ideal Customer Profile (ICP).

ICP:
${JSON.stringify(icp, null, 2)}

Leads to score:
${JSON.stringify(leads, null, 2)}

Score each lead as "High", "Medium", or "Low" fit. Select the top 3 leads that are "High" or "Medium" fit, ordered by fit score descending (High first).

Return ONLY a JSON array with exactly up to 3 items. Each item must include all original lead fields PLUS:
- "fit_score": "High" or "Medium"
- "fit_reasoning": a 1-2 sentence explanation of why this lead fits the ICP

Return ONLY valid JSON — no markdown fences, no explanation.`,
      },
    ]);

    let topLeads: TopLead[] = [];
    try {
      const cleaned = response.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
      topLeads = JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse lead scores from agent response: ${response.text}`);
    }

    return { topLeads: topLeads.slice(0, 3) };
  },
});

const formatSummaries = createStep({
  id: 'format-summaries',
  description: 'Formats each top lead into a structured, readable summary for salespeople',
  inputSchema: z.object({
    topLeads: z.array(topLeadSchema),
  }),
  outputSchema: z.object({
    summaries: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    const { topLeads } = inputData;

    const agent = mastra?.getAgent('salesAgent');
    if (!agent) {
      throw new Error('Sales agent not found');
    }

    const summaries: string[] = [];

    for (const lead of topLeads) {
      const response = await agent.generate([
        {
          role: 'user',
          content: `Format this sales lead into a clear, readable summary for a salesperson.

Lead data:
${JSON.stringify(lead, null, 2)}

Use exactly this structure (copy the labels and blank lines precisely):

**${lead.company_name}** — ${lead.fit_score} Match
${lead.contact_name} · ${lead.job_title}
${lead.contact_email}${lead.website ? ' · ' + lead.website : ''}${lead.location ? ' · ' + lead.location : ''}

**About**
[Write 2-3 sentences describing what the company does based on company_description and industry.]

**Why They Fit**
[Expand the fit_reasoning into 2-3 sentences explaining specific ICP alignment.]

**Pain Points**
[List the pain points from the lead data as short bullet points using "- " prefix, or write "Not specified" if empty.]

**Deal Potential**
[Summarize company size and annual revenue. Write "Not specified" if both are missing.]

**Suggested Outreach Angle**
[Write 1-2 sentences with a personalized angle for cold outreach, referencing the company's pain points and what makes them a strong fit.]

Fill in all bracketed sections with real content. Return only the formatted summary text, no extra commentary.`,
        },
      ]);

      summaries.push(response.text.trim());
    }

    return { summaries };
  },
});

export const leadSummaryWorkflow = createWorkflow({
  id: 'lead-summary-workflow',
  description:
    'Scores sales leads against an ICP and generates formatted summaries of the top 3 strongest matches',
  inputSchema: z.object({
    leads: z.array(leadSchema),
    icp: icpSchema,
  }),
  outputSchema: z.object({
    summaries: z.array(z.string()),
  }),
})
  .then(scoreAndSelect)
  .then(formatSummaries);

leadSummaryWorkflow.commit();
