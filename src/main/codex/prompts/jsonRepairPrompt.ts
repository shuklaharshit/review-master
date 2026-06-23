/**
 * Builds a repair prompt instructing Codex to fix a previous output so it
 * becomes strict JSON matching the preflight analysis schema (spec §14.8).
 * The repaired output must be raw JSON only — no backticks, no markdown.
 */
export function buildJsonRepairPrompt(rawOutput: string, schemaHint: string): string {
  return `Your previous response was supposed to be a single strict JSON document matching the Review Master preflight analysis schema, but it could not be parsed and validated.

Fix it now.

Requirements:
- Return ONLY corrected, strict JSON.
- Do NOT wrap the JSON in backticks or code fences.
- Do NOT include any markdown, prose, or explanation before or after the JSON.
- Do NOT include comments inside the JSON.
- Use double quotes for all keys and string values.
- Remove any trailing commas.
- Preserve as much of the original meaning and content as possible; only fix structural and schema issues.
- The result MUST validate against the schema described below.

Schema (the JSON must match this shape exactly):
${schemaHint}

Here is the previous output that needs to be repaired:
${rawOutput}

Return only the corrected JSON document.`
}
