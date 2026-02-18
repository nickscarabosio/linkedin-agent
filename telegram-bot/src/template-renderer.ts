// ============================================================
// Template Merge Field Renderer
// ============================================================

export interface MergeContext {
  // Candidate fields
  first_name?: string;
  last_name?: string;
  full_name?: string;
  title?: string;
  company?: string;

  // Scoring/personalization
  hook?: string; // personalization_hook from scoring

  // Role/campaign fields
  function?: string; // e.g. "Sales", "Engineering"
  company_type?: string; // e.g. "growth-stage SaaS"
  role_level?: string; // e.g. "VP", "Director"
  industry?: string;
  client_description_external?: string;
  role_one_liner?: string;

  // Recruiter/system fields
  recruiter_name?: string;
  qualify_link?: string;
}

/**
 * Render a template string by replacing {{merge_fields}} with values from context.
 * Unknown fields are replaced with empty string.
 */
export function renderTemplate(template: string, context: MergeContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, field: string) => {
    const value = context[field as keyof MergeContext];
    return value ?? "";
  });
}

/**
 * Build a MergeContext from candidate data, campaign/job spec, and scoring result.
 */
export function buildMergeContext(opts: {
  candidate: {
    name?: string;
    title?: string;
    company?: string;
    location?: string;
    personalization_hook?: string;
  };
  campaign?: {
    role_title?: string;
    role_description?: string;
    job_spec?: {
      function?: string;
      role_level?: string;
      client_description_external?: string;
      role_one_liner?: string;
      industry_targets?: string[];
      growth_stage?: string[];
    };
  };
  recruiter_name?: string;
  qualify_link?: string;
}): MergeContext {
  const { candidate, campaign, recruiter_name, qualify_link } = opts;

  // Split name into first/last
  const nameParts = (candidate.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const jobSpec = campaign?.job_spec;

  // Derive company_type from growth_stage if available
  let companyType = "";
  if (jobSpec?.growth_stage?.length) {
    companyType = jobSpec.growth_stage.join("/");
  }

  // Derive industry from job spec targets
  let industry = "";
  if (jobSpec?.industry_targets?.length) {
    industry = jobSpec.industry_targets[0];
  }

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: candidate.name || "",
    title: candidate.title || "",
    company: candidate.company || "",
    hook: candidate.personalization_hook || "",
    function: jobSpec?.function || "",
    company_type: companyType,
    role_level: jobSpec?.role_level || "",
    industry,
    client_description_external: jobSpec?.client_description_external || "",
    role_one_liner: jobSpec?.role_one_liner || "",
    recruiter_name: recruiter_name || "",
    qualify_link: qualify_link || "",
  };
}
