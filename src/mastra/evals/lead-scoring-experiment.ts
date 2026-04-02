/**
 * Lead Scoring Experiment
 *
 * Runs the leadSummaryWorkflow against a dataset of test cases to measure
 * how accurately it selects and summarizes leads for a given ICP.
 *
 * Run with:
 *   npx tsx src/mastra/evals/lead-scoring-experiment.ts
 *
 * Results are persisted to mastra.db and visible in Mastra Studio under
 * Datasets → lead-scoring-eval → Experiments.
 */

import { gracefulExit } from 'exit-hook';
import { mastra } from '../index';
import { leadFitScorer } from '../scorers/sales-scorer';

// ---------------------------------------------------------------------------
// Sample test cases
// Each item has an `input` matching the leadSummaryWorkflow's inputSchema
// and a `groundTruth` with the company names that should be in the top 3.
// ---------------------------------------------------------------------------

const TEST_CASES = [
  {
    input: {
      icp: {
        target_industries: 'B2B SaaS, Cloud Infrastructure',
        target_company_size: '50-500 employees',
        key_personas: 'VP of Engineering, CTO, Head of Platform',
        pain_points: 'Slow deployments, lack of observability, manual infrastructure management',
        ideal_deal_size: '$50K-$200K ARR',
        target_locations: 'North America',
        other_criteria: 'Companies actively scaling engineering teams',
      },
      leads: [
        {
          company_name: 'CloudFlow Inc.',
          contact_name: 'Sarah Chen',
          contact_email: 'schen@cloudflow.io',
          job_title: 'VP of Engineering',
          industry: 'B2B SaaS',
          company_size: '120 employees',
          annual_revenue: '$8M ARR',
          location: 'San Francisco, CA',
          company_description:
            'CloudFlow builds workflow automation software for enterprise teams. Rapidly scaling from Series A.',
          pain_points: 'Deployment pipeline bottlenecks, on-call fatigue, no unified observability',
          website: 'cloudflow.io',
          notes: 'Recently hired 30 engineers in 6 months',
        },
        {
          company_name: 'RetailPulse',
          contact_name: 'Marcus Webb',
          contact_email: 'marcus@retailpulse.com',
          job_title: 'Director of Marketing',
          industry: 'Retail Analytics',
          company_size: '40 employees',
          annual_revenue: '$3M ARR',
          location: 'Chicago, IL',
          company_description: 'RetailPulse provides foot-traffic analytics for brick-and-mortar stores.',
          pain_points: 'Low brand awareness, difficulty converting free trials',
          website: 'retailpulse.com',
          notes: 'Looking for marketing tools, not infrastructure',
        },
        {
          company_name: 'DataStack Systems',
          contact_name: 'Priya Nair',
          contact_email: 'priya.nair@datastacksys.com',
          job_title: 'CTO',
          industry: 'Cloud Infrastructure',
          company_size: '200 employees',
          annual_revenue: '$20M ARR',
          location: 'Austin, TX',
          company_description:
            'DataStack builds managed Kubernetes platforms for enterprise engineering teams.',
          pain_points: 'Multi-cluster observability gaps, manual scaling operations, high cloud costs',
          website: 'datastacksys.com',
          notes: 'CTO mentioned pain with observability at last conference',
        },
        {
          company_name: 'FreshBite Co.',
          contact_name: 'James Torres',
          contact_email: 'jtorres@freshbite.com',
          job_title: 'CEO',
          industry: 'Food & Beverage',
          company_size: '15 employees',
          annual_revenue: '$800K ARR',
          location: 'Miami, FL',
          company_description: 'FreshBite delivers healthy meal kits to consumers in the Southeast US.',
          pain_points: 'Delivery logistics, food waste management',
          website: 'freshbite.com',
          notes: 'Not a tech company',
        },
        {
          company_name: 'Nexus Platform',
          contact_name: 'Alex Kim',
          contact_email: 'alex.kim@nexusplatform.dev',
          job_title: 'Head of Platform Engineering',
          industry: 'B2B SaaS',
          company_size: '350 employees',
          annual_revenue: '$45M ARR',
          location: 'New York, NY',
          company_description:
            'Nexus provides a developer platform for internal tooling, CI/CD, and service mesh management.',
          pain_points: 'Fragmented toolchain, slow incident response, lack of developer self-service',
          website: 'nexusplatform.dev',
          notes: 'Evaluating infrastructure vendors this quarter',
        },
      ],
    },
    groundTruth: {
      expectedTopCompanies: ['CloudFlow Inc.', 'DataStack Systems', 'Nexus Platform'],
      note: 'RetailPulse and FreshBite are clearly outside the ICP (wrong industry/persona/size)',
    },
  },
  {
    input: {
      icp: {
        target_industries: 'Healthcare, Health Tech',
        target_company_size: '200-2000 employees',
        key_personas: 'Chief Medical Officer, VP of Clinical Operations, Director of IT',
        pain_points: 'HIPAA compliance overhead, interoperability with EHR systems, staff burnout',
        ideal_deal_size: '$100K-$500K ARR',
        target_locations: 'United States',
        other_criteria: 'Hospital systems or health tech companies with clinical workflows',
      },
      leads: [
        {
          company_name: 'CareSync Health',
          contact_name: 'Dr. Linda Park',
          contact_email: 'lpark@caresynch.com',
          job_title: 'Chief Medical Officer',
          industry: 'Health Tech',
          company_size: '450 employees',
          annual_revenue: '$35M ARR',
          location: 'Boston, MA',
          company_description:
            'CareSync builds care coordination software for hospital networks, integrating with Epic and Cerner.',
          pain_points: 'EHR integration complexity, care gap identification, staff documentation burden',
          website: 'caresynch.com',
          notes: 'Just closed Series B; expanding to 3 new health systems',
        },
        {
          company_name: 'BrightSmile Dental',
          contact_name: 'Tom Nguyen',
          contact_email: 'tom@brightsmile.com',
          job_title: 'Office Manager',
          industry: 'Dental',
          company_size: '8 employees',
          annual_revenue: '$1.2M',
          location: 'Phoenix, AZ',
          company_description: 'Single-location dental practice serving the Phoenix metro area.',
          pain_points: 'Patient scheduling, billing',
          website: 'brightsmile.com',
          notes: 'Way too small, not enterprise',
        },
        {
          company_name: 'Meridian Hospital Group',
          contact_name: 'Rachel Foster',
          contact_email: 'rfoster@meridianhealth.org',
          job_title: 'VP of Clinical Operations',
          industry: 'Healthcare',
          company_size: '1800 employees',
          annual_revenue: '$220M',
          location: 'Chicago, IL',
          company_description:
            'Meridian operates 6 regional hospitals across the Midwest. Undergoing digital transformation.',
          pain_points: 'HIPAA audit readiness, cross-site interoperability, nursing staff retention',
          website: 'meridianhealth.org',
          notes: 'IT director mentioned compliance pain at HIMSS',
        },
        {
          company_name: 'HealthOps AI',
          contact_name: 'Justin Marsh',
          contact_email: 'jmarsh@healthopsai.com',
          job_title: 'Director of IT',
          industry: 'Health Tech',
          company_size: '280 employees',
          annual_revenue: '$22M ARR',
          location: 'Seattle, WA',
          company_description:
            'HealthOps AI uses machine learning to optimize hospital staffing and resource allocation.',
          pain_points: 'Integrating with legacy EHR systems, HIPAA-compliant data pipelines',
          website: 'healthopsai.com',
          notes: 'Strong ICP fit — AI/clinical ops overlap',
        },
        {
          company_name: 'FitLife App',
          contact_name: 'Chloe Davis',
          contact_email: 'chloe@fitlifeapp.com',
          job_title: 'CEO',
          industry: 'Consumer Fitness',
          company_size: '25 employees',
          annual_revenue: '$2M ARR',
          location: 'Austin, TX',
          company_description: 'FitLife is a B2C fitness tracking app for individual consumers.',
          pain_points: 'User retention, subscription churn',
          website: 'fitlifeapp.com',
          notes: 'B2C consumer, not a fit',
        },
      ],
    },
    groundTruth: {
      expectedTopCompanies: ['CareSync Health', 'Meridian Hospital Group', 'HealthOps AI'],
      note: 'BrightSmile is too small (8 employees); FitLife is B2C consumer with wrong industry',
    },
  },
];

// ---------------------------------------------------------------------------
// Experiment runner
// ---------------------------------------------------------------------------

async function runLeadScoringExperiment() {
  console.log('Starting lead scoring experiment...\n');

  // Get or create the dataset
  let dataset;
  const datasetName = 'lead-scoring-eval';

  try {
    const { datasets } = await mastra.datasets.list();
    const existing = datasets.find((d: { name: string }) => d.name === datasetName);

    if (existing) {
      console.log(`Found existing dataset: ${existing.id}`);
      dataset = await mastra.datasets.get({ id: existing.id });

      // Clear old items so we start fresh each run
      const { items } = await dataset.listItems({ perPage: 100 });
      if (items.length > 0) {
        await dataset.deleteItems({ itemIds: items.map((i: { id: string }) => i.id) });
        console.log(`Cleared ${items.length} old items.`);
      }
    } else {
      dataset = await mastra.datasets.create({
        name: datasetName,
        description:
          'Evaluates lead scoring quality: does the leadSummaryWorkflow select the right leads for a given ICP?',
      });
      console.log(`Created dataset: ${dataset.id}`);
    }
  } catch (err) {
    console.error('Failed to access datasets API:', err);
    throw err;
  }

  // Seed items
  await dataset.addItems({
    items: TEST_CASES.map(({ input, groundTruth }) => ({ input, groundTruth })),
  });
  console.log(`Added ${TEST_CASES.length} test items.\n`);

  // Run the experiment
  const experimentName = `lead-scoring-${new Date().toISOString().slice(0, 10)}`;
  console.log(`Running experiment: "${experimentName}"...`);

  const summary = await dataset.startExperiment({
    name: experimentName,
    targetType: 'workflow',
    targetId: 'leadSummaryWorkflow',
    scorers: [leadFitScorer],
    maxConcurrency: 1,
  });

  // ── Print results ──────────────────────────────────────────────────────────

  const divider = '─'.repeat(60);
  const thick = '═'.repeat(60);

  console.log(`\n${thick}`);
  console.log('  EXPERIMENT RESULTS');
  console.log(`  ${experimentName}`);
  console.log(thick);
  console.log(`  Status:    ${summary.status.toUpperCase()}`);
  console.log(`  Passed:    ${summary.succeededCount} / ${summary.totalItems}`);
  if (summary.failedCount > 0) {
    console.log(`  Failed:    ${summary.failedCount}`);
  }
  console.log('');

  const results = summary.results ?? [];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const testCase = TEST_CASES[i];

    const icpLabel = testCase
      ? `${testCase.input.icp.target_industries.split(',')[0].trim()} ICP`
      : `Test Case ${i + 1}`;

    console.log(`${divider}`);
    console.log(`  TEST CASE ${i + 1}: ${icpLabel}`);
    console.log(divider);

    if (testCase) {
      console.log(`  ICP Industries:  ${testCase.input.icp.target_industries}`);
      console.log(`  ICP Personas:    ${testCase.input.icp.key_personas}`);
      console.log(`  ICP Size:        ${testCase.input.icp.target_company_size}`);
      console.log(`  Leads provided:  ${testCase.input.leads.length}`);

      const expected = (testCase.groundTruth as { expectedTopCompanies: string[] })
        .expectedTopCompanies;
      console.log(`  Expected top 3:  ${expected.join(', ')}`);
    }

    // Extract selected company names from summaries (lines starting with "COMPANY:")
    const output = item.output as { summaries?: string[] } | undefined;
    if (output?.summaries?.length) {
      const selected = output.summaries.map((s: string) => {
        const match = s.match(/COMPANY:\s*(.+)/);
        return match ? match[1].trim() : '(unknown)';
      });
      console.log(`  Selected top ${selected.length}:  ${selected.join(', ')}`);
    }

    console.log('');

    if (item.error) {
      console.log(`  ❌ Error: ${item.error}`);
    } else {
      for (const scoreResult of item.scores ?? []) {
        const score = scoreResult.score ?? 0;
        const pct = Math.round(score * 100);
        const barFilled = Math.round(score * 20);
        const bar = '█'.repeat(barFilled) + '░'.repeat(20 - barFilled);

        console.log(`  Scorer: ${scoreResult.scorerName}`);
        console.log(`  Score:  [${bar}] ${pct}%`);

        // Parse the pipe-delimited reason string into labelled lines
        if (scoreResult.reason) {
          const parts = scoreResult.reason.split(' | ');
          for (const part of parts) {
            if (!part.startsWith('Score:')) {
              const icon = part.includes('true') ? '✓' : part.includes('false') ? '✗' : '•';
              console.log(`          ${icon} ${part}`);
            }
          }
        }
      }
    }

    console.log('');
  }

  // Overall average score
  const allScores = results.flatMap((r) => (r.scores ?? []).map((s) => s.score ?? 0));
  if (allScores.length > 0) {
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const pct = Math.round(avg * 100);
    const barFilled = Math.round(avg * 20);
    const bar = '█'.repeat(barFilled) + '░'.repeat(20 - barFilled);
    console.log(thick);
    console.log(`  OVERALL AVERAGE SCORE`);
    console.log(`  [${bar}] ${pct}%`);
    console.log(thick);
  }
}

runLeadScoringExperiment()
  .catch(console.error)
  .finally(() => gracefulExit(0));
