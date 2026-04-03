import { useRef, useState, useEffect } from "react";
import { useFetcher, useSearchParams, useRevalidator } from "react-router";

type ImportStep = "upload" | "mapping" | "importing";

const APP_FIELDS = [
  { key: "rating", label: "Rating", required: true, desc: "Score from 1–5" },
  { key: "handle", label: "Product Handle", required: true, desc: "Product URL handle (e.g. my-product)" },
  { key: "author", label: "Author", required: true, desc: "Customer name" },
  { key: "email", label: "Email", required: false, desc: "Customer email address" },
  { key: "title", label: "Review Title", required: false, desc: "Short review headline" },
  { key: "content", label: "Content", required: false, desc: "Full review text" },
  { key: "images", label: "Images", required: false, desc: "Image URL(s), comma-separated" },
  { key: "created_at", label: "Created At", required: false, desc: "Date the review was created" },
  { key: "country_code", label: "Country Code", required: false, desc: "2-letter country code" },
] as const;

type AppFieldKey = typeof APP_FIELDS[number]["key"];

const AUTO_MAP: Record<string, AppFieldKey> = {
  rating: "rating", Rating: "rating", review_score: "rating", star_rating: "rating",
  handle: "handle", Handle: "handle", product_handle: "handle", "product handle": "handle",
  "Product Handle": "handle", product_url: "handle",
  author: "author", Author: "author", reviewer_name: "author", display_name: "author",
  "Customer Name": "author", customer_name: "author", name: "author",
  email: "email", Email: "email", reviewer_email: "email", "Customer Email": "email",
  customer_email: "email",
  title: "title", Title: "title", review_title: "title", "Review Title": "title",
  content: "content", Content: "content", body: "content", review_body: "content",
  "Review Content": "content", review_content: "content",
  images: "images", Images: "images", image_url: "images", "Image URL": "images",
  imageUrl: "images", picture_urls: "images", photo_url: "images",
  created_at: "created_at", Created_At: "created_at", "Created At": "created_at",
  review_date: "created_at", createdAt: "created_at", date: "created_at",
  country_code: "country_code", Country_Code: "country_code", country: "country_code",
};

function buildAutoMapping(headers: string[]): Record<AppFieldKey, string> {
  const mapping: Partial<Record<AppFieldKey, string>> = {};
  for (const h of headers) {
    const appKey = AUTO_MAP[h] ?? AUTO_MAP[h.toLowerCase()];
    if (appKey && !mapping[appKey]) {
      mapping[appKey] = h;
    }
  }
  return mapping as Record<AppFieldKey, string>;
}

export default function ReviewImportModal() {
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<AppFieldKey, string>>(
    {} as Record<AppFieldKey, string>
  );
  const [isImporting, setIsImporting] = useState(false);

  const resetImportModal = () => {
    setImportStep("upload");
    setSelectedFile(null);
    setCsvHeaders([]);
    setFieldMapping({} as Record<AppFieldKey, string>);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const firstLine = text.split("\n")[0] || "";
      const headers: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of firstLine) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === "," && !inQuotes) { headers.push(current.trim()); current = ""; }
        else { current += char; }
      }
      if (current.trim()) headers.push(current.trim());
      setCsvHeaders(headers);
      setFieldMapping(buildAutoMapping(headers));
    };
    reader.readAsText(file);
  };

  const handleModalImport = () => {
    if (!selectedFile) return;
    setImportStep("importing");
    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("mapping", JSON.stringify(fieldMapping));
    const targetProductId = searchParams.get("productId");
    if (targetProductId) {
      formData.append("targetProductId", targetProductId);
    }

    fetcher.submit(formData, {
      method: "post",
      action: "/api/reviews/import",
      encType: "multipart/form-data",
    });
  };

  // Handle import completion
  useEffect(() => {
    if (isImporting && fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      const shopify = (window as any).shopify;

      setIsImporting(false);

      if (data.success) {
        (document.getElementById("import-modal-close") as HTMLButtonElement)?.click();
        resetImportModal();
        if (shopify?.toast?.show) {
          shopify.toast.show(data.message || "Reviews imported successfully");
        }
        revalidator.revalidate();
      } else {
        setImportStep("mapping");
        if (shopify?.toast?.show) {
          shopify.toast.show(data.error || "Import failed", { isError: true });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImporting, fetcher.state, fetcher.data]);

  return (
    <s-modal
      id="import-modal"
      heading="Import CSV Editor"
      // @ts-expect-error web component event
      onClose={resetImportModal}
    >
      {/* Step Indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", fontSize: "14px" }}>
        <span style={{ color: importStep !== "upload" ? "#008060" : undefined, fontWeight: importStep === "upload" ? 600 : undefined }}>① Upload file</span>
        <span style={{ color: "#ccc" }}>›</span>
        <span style={{ color: importStep === "mapping" || importStep === "importing" ? "#008060" : "#aaa", fontWeight: importStep === "mapping" ? 600 : undefined }}>② Mapping fields</span>
        <span style={{ color: "#ccc" }}>›</span>
        <span style={{ color: importStep === "importing" ? "#008060" : "#aaa", fontWeight: importStep === "importing" ? 600 : undefined }}>③ Import</span>
      </div>

      {/* Step 1: Upload */}
      {importStep === "upload" && (
        <s-stack gap="base">
          <s-text>
            Select a <strong>.csv</strong> file to import reviews. Download the{" "}
            <s-link onClick={() => window.open("/api/reviews/template", "_blank")}>CSV template</s-link>{" "}
            to see the expected format.
          </s-text>
          <s-box
            borderWidth="base"
            borderRadius="base"
            padding="large"
            // @ts-expect-error web component
            style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <s-stack gap="small" alignItems="center">
              <s-icon type="upload" />
              <s-text>{selectedFile ? selectedFile.name : "Click to choose a CSV file"}</s-text>
              {selectedFile && <s-text color="subdued">{(selectedFile.size / 1024).toFixed(1)} KB</s-text>}
            </s-stack>
          </s-box>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />
          <s-stack direction="inline" gap="small" justifyContent="end">
            <s-button commandFor="import-modal" command="--hide">Cancel</s-button>
            <s-button
              variant="primary"
              onClick={() => selectedFile && setImportStep("mapping")}
              disabled={!selectedFile}
            >
              Next →
            </s-button>
          </s-stack>
        </s-stack>
      )}

      {/* Step 2: Mapping */}
      {importStep === "mapping" && (
        <s-stack gap="base">
          <div>
            <s-text><strong>Header columns from CSV</strong></s-text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
              {csvHeaders.map((h) => (
                <span
                  key={h}
                  style={{
                    background: Object.values(fieldMapping).includes(h) ? "#008060" : "#e4e5e7",
                    color: Object.values(fieldMapping).includes(h) ? "#fff" : "#202223",
                    borderRadius: "20px",
                    padding: "4px 12px",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text><strong>Bolt Reviews fields</strong></s-text>
            <s-button
              variant="tertiary"
              onClick={() => setFieldMapping(buildAutoMapping(csvHeaders))}
            >
              ↺ Auto mapping fields
            </s-button>
          </s-stack>

          <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f6f6f7" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>App Field</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>Required</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>CSV Column</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {APP_FIELDS.map((field, i) => (
                  <tr key={field.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1", color: "#008060", fontWeight: 500 }}>
                      {field.label}
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1" }}>
                      <span style={{ color: field.required ? "#d72c0d" : "#6d7175", fontSize: "12px", fontWeight: 600 }}>
                        {field.required ? "true" : "false"}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1" }}>
                      <select
                        value={fieldMapping[field.key] || ""}
                        onChange={(e) =>
                          setFieldMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: `1px solid ${field.required && !fieldMapping[field.key] ? "#d72c0d" : "#c9cccf"}`,
                          fontSize: "13px",
                          background: "#fff",
                          minWidth: "140px",
                        }}
                      >
                        <option value="">— not mapped —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1", color: "#6d7175" }}>
                      {field.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <s-stack direction="inline" gap="small" justifyContent="space-between">
            <s-button variant="tertiary" onClick={() => setImportStep("upload")}>← Back</s-button>
            <s-stack direction="inline" gap="small">
              <s-button commandFor="import-modal" command="--hide">Cancel</s-button>
              <s-button
                variant="primary"
                onClick={handleModalImport}
                disabled={
                  APP_FIELDS.filter((f) => f.required).some((f) => !fieldMapping[f.key])
                }
              >
                Import →
              </s-button>
            </s-stack>
          </s-stack>
        </s-stack>
      )}

      {/* Step 3: Importing */}
      {importStep === "importing" && (
        <s-stack gap="base" alignItems="center">
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
            <s-text><strong>Importing reviews…</strong></s-text>
            <div style={{ marginTop: "8px" }}>
              <s-text color="subdued">Please wait, this may take a moment.</s-text>
            </div>
          </div>
        </s-stack>
      )}
    </s-modal>
  );
}
