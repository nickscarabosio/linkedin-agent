import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// Types (mirrored from dashboard/lib/types.ts for backend use)
// ============================================================

export interface JobSpec {
  industry_targets?: string[];
  industry_adjacent_ok?: string[];
  company_size_min?: number;
  company_size_max?: number;
  growth_stage?: string[];
  location?: string;
  remote_policy?: string;
  years_experience_min?: number;
  years_experience_ideal?: number;
  required_skills?: string[];
  nice_to_have_skills?: string[];
  required_certifications?: string[];
  education_required?: boolean;
  education_preferred?: string;
  disqualify_companies?: string[];
  disqualify_titles?: string[];
  client_description_external?: string;
  role_one_liner?: string;
  function?: string;
  role_level?: string;
  weight_overrides?: Record<string, number>;
  notes?: string;
}

export interface WorkExperience {
  title: string;
  company: string;
  company_size?: number;
  industry?: string;
  start_date?: string;
  end_date?: string | null;
  duration_months?: number;
  is_current?: boolean;
  description?: string;
}

export interface Education {
  school: string;
  degree?: string;
  field?: string;
  graduation_year?: number;
}

export interface CandidateProfile {
  current_title?: string;
  current_company?: string;
  current_company_size?: number;
  current_industry?: string;
  location?: string;
  open_to_work?: boolean;
  experience?: WorkExperience[];
  education?: Education[];
  skills?: string[];
  certifications?: string[];
  summary?: string;
  has_posted_content?: boolean;
  mutual_connections?: number;
  profile_completeness?: "full" | "partial" | "sparse";
  recent_activity?: boolean;
}

export interface ScoreBreakdown {
  role_fit: number;
  company_context: number;
  trajectory_stability: number;
  education: number;
  profile_quality: number;
  bonus: number;
}

export type ScoreBucket = "Hot" | "Warm" | "Cool" | "Cold";

export interface ScoringResult {
  hard_filter_passed: boolean;
  disqualify_reason: string | null;
  scores: ScoreBreakdown;
  total_score: number;
  bucket: ScoreBucket;
  score_rationale: string;
  recommended_action: string;
  personalization_hook: string;
  flags: string[];
}

// ============================================================
// Default weights
// ============================================================

const DEFAULT_WEIGHTS: Record<string, number> = {
  role_fit: 40,
  company_context: 25,
  trajectory_stability: 20,
  education: 10,
  profile_quality: 5,
};

// ============================================================
// Scoring System Prompt (from spec Part 6)
// ============================================================

const SCORING_SYSTEM_PROMPT = `You are a professional recruiting analyst. Your job is to score LinkedIn candidates against a job description using a structured rubric.

You will receive:
1. A job object (JSON) defining the role requirements and scoring weights
2. A candidate object (JSON) with normalized LinkedIn profile data

Your task:
- Apply the hard filter rules first. If any hard filter is triggered, return disqualified with a reason and stop.
- If the candidate passes hard filters, score each category per the rubric
- Apply bonus signals
- Sum the total score and assign a bucket (Hot, Warm, Cool, Cold)
- Write a 2-3 sentence score_rationale explaining the key drivers of the score
- Generate a personalization_hook: a 1-sentence observation about something specific and notable in the candidate's profile that would feel relevant and genuine in an outreach message. Do not use generic observations.
- Return the complete scoring output object as JSON

Rules:
- Be consistent. Score the same type of profile the same way every time.
- When data is missing from the profile, do not assume. Score that sub-criterion as 0 or minimum.
- The personalization_hook must be specific to this candidate. Never use "I noticed your impressive background" or similar filler.
- Do not invent data not present in the candidate object.
- Output ONLY valid JSON. No commentary outside the JSON block.`;

// ============================================================
// Scoring Rubric Prompt (detailed criteria for Claude)
// ============================================================

function buildScoringRubricPrompt(weights: Record<string, number>): string {
  return `
## SCORING RUBRIC

### TIER 1 — HARD FILTERS (Auto-Disqualify)
DISQUALIFY IF:
- candidate.location does not match job.location AND job.remote_policy = "onsite"
- candidate.current_company is in job.disqualify_companies (case-insensitive)
- candidate.current_title contains any string in job.disqualify_titles (case-insensitive)
- candidate has NO role with tenure > 12 months across entire career (chronic job hopping)
- job.required_certifications is not empty AND candidate.certifications does not contain all required certs
- candidate's entire career is in a completely unrelated function (e.g., graphic design for a sales role)

If disqualified, return:
{
  "hard_filter_passed": false,
  "disqualify_reason": "<specific reason>",
  "scores": { "role_fit": 0, "company_context": 0, "trajectory_stability": 0, "education": 0, "profile_quality": 0, "bonus": 0 },
  "total_score": 0,
  "bucket": "Cold",
  "score_rationale": "<why disqualified>",
  "recommended_action": "Do not contact — archive with reason",
  "personalization_hook": "",
  "flags": ["disqualified:<reason>"]
}

### TIER 2 — WEIGHTED SCORING (0-100 Points)

**ROLE FIT — ${weights.role_fit} points**
| Sub-criterion | Max Points | Scoring Logic |
|---|---|---|
| Title match | ${Math.round(weights.role_fit * 0.375)} | Exact or equivalent title (VP Sales = Head of Sales) = max; one level off (Director vs VP) = 67%; adjacent function = 33%; weak match = 0 |
| Years of relevant experience | ${Math.round(weights.role_fit * 0.375)} | Meets or exceeds ideal = max; meets minimum = 67%; within 20% of minimum = 33%; below = 0 |
| Industry match | ${Math.round(weights.role_fit * 0.25)} | Exact target industry = max; adjacent industry = 60%; transferable but different = 30%; unrelated = 0 |

**COMPANY CONTEXT — ${weights.company_context} points**
| Sub-criterion | Max Points | Scoring Logic |
|---|---|---|
| Company size match | ${Math.round(weights.company_context * 0.4)} | Current/recent company within size range = max; within 50% of range = 60%; outside = 20% |
| Growth stage match | ${Math.round(weights.company_context * 0.4)} | Worked at matching growth stage = max; one stage off = 60%; enterprise-only for startup = 20% |
| Brand/pedigree signal | ${Math.round(weights.company_context * 0.2)} | Well-known relevant brand = max; unknown = 60%; red-flag brand = 0. If client doesn't specify, score 60% as neutral. |

**TRAJECTORY & STABILITY — ${weights.trajectory_stability} points**
| Sub-criterion | Max Points | Scoring Logic |
|---|---|---|
| Upward title progression | ${Math.round(weights.trajectory_stability * 0.5)} | Clear upward movement = max; lateral with growth = 70%; flat = 40%; downward = 0 |
| Average tenure per role | ${Math.round(weights.trajectory_stability * 0.5)} | 2+ years avg = max; 18-24 months = 70%; 12-18 months = 40%; under 12 months = 0. Exclude current role if < 6 months. |

**EDUCATION — ${weights.education} points** (can be zero if education_required=false and weight is zeroed)
| Sub-criterion | Max Points | Scoring Logic |
|---|---|---|
| Degree level | ${Math.round(weights.education * 0.5)} | Meets or exceeds preferred = max; one level below = 60%; no degree when preferred = 20% |
| Field relevance | ${Math.round(weights.education * 0.5)} | Directly relevant field = max; adjacent = 60%; unrelated = 20% |

**PROFILE QUALITY — ${weights.profile_quality} points**
| Sub-criterion | Max Points | Scoring Logic |
|---|---|---|
| Profile completeness | ${Math.round(weights.profile_quality * 0.4)} | Has summary + full experience + skills = max; partial = 50%; sparse = 0 |
| Recent activity | ${Math.round(weights.profile_quality * 0.6)} | Posted/engaged in last 90 days = max; some activity = 33%; none = 0 |

### TIER 3 — BONUS SIGNALS (Cap at +10 total)
| Signal | Points |
|---|---|
| Open To Work badge | +5 |
| Job change within last 6 months | +3 |
| 3+ mutual connections | +2 |
| Internal promotion visible | +3 |
| Active content creator in target domain | +2 |
| Alma mater match with client leadership | +2 |

### BUCKET ASSIGNMENT
| Total Score | Label | Default Action |
|---|---|---|
| 85-100 | Hot | Immediate outreach — personalized connection note |
| 65-84 | Warm | Outreach — standard template with light personalization |
| 45-64 | Cool | Queue — hold for volume fill or lower-priority roles |
| Below 45 | Cold | Do not contact — archive with reason |

### OUTPUT FORMAT
Return a single JSON object with this exact shape:
{
  "hard_filter_passed": boolean,
  "disqualify_reason": string | null,
  "scores": {
    "role_fit": number,
    "company_context": number,
    "trajectory_stability": number,
    "education": number,
    "profile_quality": number,
    "bonus": number
  },
  "total_score": number,
  "bucket": "Hot" | "Warm" | "Cool" | "Cold",
  "score_rationale": "2-3 sentence explanation",
  "recommended_action": "what to do next",
  "personalization_hook": "1 specific sentence for outreach",
  "flags": ["array of notable signals"]
}`;
}

// ============================================================
// ScoringService
// ============================================================

export class ScoringService {
  constructor(private claude: Anthropic) {}

  async scoreCandidate(
    candidate: CandidateProfile,
    jobSpec: JobSpec
  ): Promise<ScoringResult> {
    // Step 1: Apply deterministic hard filters first (no LLM needed)
    const hardFilterResult = this.applyHardFilters(candidate, jobSpec);
    if (hardFilterResult) {
      return {
        hard_filter_passed: false,
        disqualify_reason: hardFilterResult,
        scores: {
          role_fit: 0,
          company_context: 0,
          trajectory_stability: 0,
          education: 0,
          profile_quality: 0,
          bonus: 0,
        },
        total_score: 0,
        bucket: "Cold",
        score_rationale: `Candidate disqualified: ${hardFilterResult}`,
        recommended_action: "Do not contact — archive with reason",
        personalization_hook: "",
        flags: [`disqualified:${hardFilterResult}`],
      };
    }

    // Step 2: Use Claude for fuzzy/semantic scoring
    const weights = { ...DEFAULT_WEIGHTS, ...jobSpec.weight_overrides };
    const rubricPrompt = buildScoringRubricPrompt(weights);

    const userPrompt = `Score this candidate against the job specification.

## JOB SPECIFICATION
${JSON.stringify(jobSpec, null, 2)}

## CANDIDATE PROFILE
${JSON.stringify(candidate, null, 2)}

Apply the rubric and return the scoring JSON.`;

    const response = await this.claude.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1500,
      system: SCORING_SYSTEM_PROMPT + "\n\n" + rubricPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON from response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse scoring response from Claude");
    }

    const parsed = JSON.parse(jsonMatch[0]) as ScoringResult;

    // Enforce constraints
    parsed.hard_filter_passed = true;
    parsed.disqualify_reason = null;
    parsed.scores.bonus = Math.min(parsed.scores.bonus, 10);
    parsed.total_score = Math.min(
      parsed.scores.role_fit +
        parsed.scores.company_context +
        parsed.scores.trajectory_stability +
        parsed.scores.education +
        parsed.scores.profile_quality +
        parsed.scores.bonus,
      110
    );
    parsed.bucket = this.assignBucket(parsed.total_score);

    return parsed;
  }

  /**
   * Tier 1 — Deterministic hard filters. Returns disqualify reason or null.
   */
  private applyHardFilters(
    candidate: CandidateProfile,
    jobSpec: JobSpec
  ): string | null {
    // 1. Location + onsite policy
    if (
      jobSpec.remote_policy === "onsite" &&
      jobSpec.location &&
      candidate.location
    ) {
      const jobLoc = jobSpec.location.toLowerCase();
      const candLoc = candidate.location.toLowerCase();
      if (!candLoc.includes(jobLoc) && !jobLoc.includes(candLoc)) {
        return `Location mismatch: candidate is in "${candidate.location}" but role requires onsite in "${jobSpec.location}"`;
      }
    }

    // 2. Disqualified companies
    if (
      jobSpec.disqualify_companies?.length &&
      candidate.current_company
    ) {
      const company = candidate.current_company.toLowerCase();
      const match = jobSpec.disqualify_companies.find(
        (dc) => company.includes(dc.toLowerCase()) || dc.toLowerCase().includes(company)
      );
      if (match) {
        return `Current company "${candidate.current_company}" is on the disqualify list`;
      }
    }

    // 3. Disqualified titles
    if (
      jobSpec.disqualify_titles?.length &&
      candidate.current_title
    ) {
      const title = candidate.current_title.toLowerCase();
      const match = jobSpec.disqualify_titles.find((dt) =>
        title.includes(dt.toLowerCase())
      );
      if (match) {
        return `Current title "${candidate.current_title}" matches disqualified title pattern "${match}"`;
      }
    }

    // 4. Chronic job hopping (no role > 12 months)
    if (candidate.experience && candidate.experience.length > 0) {
      const hasLongTenure = candidate.experience.some((exp) => {
        if (exp.duration_months && exp.duration_months > 12) return true;
        if (exp.start_date) {
          const start = new Date(exp.start_date);
          const end = exp.end_date ? new Date(exp.end_date) : new Date();
          const months =
            (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth());
          return months > 12;
        }
        return false;
      });
      if (!hasLongTenure && candidate.experience.length >= 3) {
        return "Chronic job hopping: no role with tenure exceeding 12 months across career";
      }
    }

    // 5. Required certifications
    if (
      jobSpec.required_certifications?.length &&
      jobSpec.required_certifications.length > 0
    ) {
      const candidateCerts = (candidate.certifications || []).map((c) =>
        c.toLowerCase()
      );
      const missing = jobSpec.required_certifications.filter(
        (rc) => !candidateCerts.some((cc) => cc.includes(rc.toLowerCase()))
      );
      if (missing.length > 0) {
        return `Missing required certifications: ${missing.join(", ")}`;
      }
    }

    return null;
  }

  /**
   * Assign bucket based on total score.
   */
  private assignBucket(totalScore: number): ScoreBucket {
    if (totalScore >= 85) return "Hot";
    if (totalScore >= 65) return "Warm";
    if (totalScore >= 45) return "Cool";
    return "Cold";
  }
}
