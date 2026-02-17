"use client";

import { useState, useRef } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";

const csvRowSchema = z.object({
  name: z.string().min(1, "Name required"),
  linkedin_url: z.string().url("Invalid URL").refine((u) => u.includes("linkedin.com"), "Not a LinkedIn URL"),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
});

type CsvRow = z.infer<typeof csvRowSchema>;

interface ParsedRow {
  row: number;
  data: Record<string, string>;
  parsed?: CsvRow;
  error?: string;
}

interface CsvUploadProps {
  campaignId: string;
  onClose: () => void;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() || "";
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function CsvUpload({ campaignId, onClose }: CsvUploadProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ created: 0, existed: 0, failed: 0, total: 0 });
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const api = getApiClient();

  const validRows = parsedRows.filter((r) => r.parsed);
  const invalidRows = parsedRows.filter((r) => r.error);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const raw = parseCSV(text);

      const rows: ParsedRow[] = raw.map((data, idx) => {
        const result = csvRowSchema.safeParse(data);
        if (result.success) {
          return { row: idx + 2, data, parsed: result.data };
        }
        const errMsg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return { row: idx + 2, data, error: errMsg };
      });

      setParsedRows(rows);
      setDone(false);
      setProgress({ created: 0, existed: 0, failed: 0, total: 0 });
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    const totals = { created: 0, existed: 0, failed: 0, total: validRows.length };

    for (const row of validRows) {
      try {
        const response = await api.post("/api/candidates", {
          campaign_id: campaignId,
          name: row.parsed!.name,
          title: row.parsed!.title || null,
          company: row.parsed!.company || null,
          location: row.parsed!.location || null,
          linkedin_url: row.parsed!.linkedin_url,
        });
        if (response.data.already_exists) {
          totals.existed++;
        } else {
          totals.created++;
        }
      } catch {
        totals.failed++;
      }
      setProgress({ ...totals });
    }

    setImporting(false);
    setDone(true);
    queryClient.invalidateQueries({ queryKey: ["candidates", { campaign_id: campaignId }] });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Upload CSV</h3>
      <p className="text-sm text-gray-500 mb-3">
        CSV must have columns: <strong>name</strong>, <strong>linkedin_url</strong> (required). Optional: title, company, location.
      </p>

      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        Select CSV File
      </Button>

      {parsedRows.length > 0 && !done && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-700">Valid: {validRows.length}</span>
            <span className="text-red-700">Invalid: {invalidRows.length}</span>
          </div>

          {invalidRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 max-h-32 overflow-auto">
              {invalidRows.map((r) => (
                <p key={r.row} className="text-xs text-red-700">
                  Row {r.row}: {r.error}
                </p>
              ))}
            </div>
          )}

          {validRows.length > 0 && (
            <div className="border border-gray-200 rounded overflow-auto max-h-48">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">LinkedIn URL</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Title</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Company</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {validRows.slice(0, 10).map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-1.5">{r.parsed!.name}</td>
                      <td className="px-3 py-1.5 text-blue-600 truncate max-w-[200px]">{r.parsed!.linkedin_url}</td>
                      <td className="px-3 py-1.5">{r.parsed!.title || "\u2014"}</td>
                      <td className="px-3 py-1.5">{r.parsed!.company || "\u2014"}</td>
                    </tr>
                  ))}
                  {validRows.length > 10 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-1.5 text-gray-400">
                        ...and {validRows.length - 10} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {importing && (
            <div className="space-y-1">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${((progress.created + progress.existed + progress.failed) / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                Processing {progress.created + progress.existed + progress.failed} / {progress.total}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button size="sm" onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? "Importing..." : `Import ${validRows.length} Candidates`}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {done && (
        <div className="mt-4 space-y-3">
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
            Import complete: Created {progress.created}, Already existed {progress.existed}, Failed {progress.failed}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
