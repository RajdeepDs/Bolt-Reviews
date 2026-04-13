import { useState, useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { Review } from "../utils/reviews-types";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

interface ReviewDetailModalProps {
  selectedReview: Review | null;
  onClose: () => void;
}

export default function ReviewDetailModal({
  selectedReview,
  onClose,
}: ReviewDetailModalProps) {
  const updateFetcher = useFetcher();
  const replyFetcher = useFetcher();
  const revalidator = useRevalidator();

  const [replyText, setReplyText] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    rating: 0,
    status: "",
    customerName: "",
    customerEmail: "",
  });

  useEffect(() => {
    if (selectedReview) {
      setReplyText(selectedReview.merchantReply || "");
      setNewImageUrl("");
      // Normalise: prefer the images[] array, fall back to imageUrl
      const imgs =
        selectedReview.images?.length > 0
          ? selectedReview.images
          : selectedReview.imageUrl
            ? [selectedReview.imageUrl]
            : [];
      setEditImages(imgs);
      setEditForm({
        title: selectedReview.title,
        content: selectedReview.content,
        rating: selectedReview.rating,
        status: selectedReview.status,
        customerName: selectedReview.customerName,
        customerEmail: selectedReview.customerEmail || "",
      });
    }
  }, [selectedReview]);

  const handleAddImage = () => {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    setEditImages((prev) => [...prev, trimmed]);
    setNewImageUrl("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0]; // Only take 1 image
    setIsUploading(true);
    const shopify = (window as any).shopify;

    // Client-side validation
    if (!file.type.startsWith("image/")) {
      shopify?.toast?.show?.("Only image files are allowed", { isError: true });
      setIsUploading(false);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      shopify?.toast?.show?.("Image must be smaller than 5MB", { isError: true });
      setIsUploading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.url) {
        setEditImages([data.url]); // Replace — 1 image per review
      } else {
        shopify?.toast?.show?.(data.error || "Upload failed", { isError: true });
      }
    } catch (err) {
      console.error("Upload error:", err);
      shopify?.toast?.show?.("Failed to upload image", { isError: true });
    }

    setIsUploading(false);
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setEditImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveReview = () => {
    if (!selectedReview) return;
    updateFetcher.submit(
      JSON.stringify({
        customerName: editForm.customerName,
        customerEmail: editForm.customerEmail || null,
        rating: editForm.rating,
        title: editForm.title,
        content: editForm.content,
        status: editForm.status,
        images: editImages,
        imageUrl: editImages[0] ?? null,
      }),
      {
        method: "PATCH",
        action: `/api/reviews/${selectedReview.id}/update`,
        encType: "application/json",
      },
    );
  };

  const handleSaveReply = () => {
    if (!selectedReview) return;
    replyFetcher.submit(
      JSON.stringify({ reply: replyText }),
      {
        method: "POST",
        action: `/api/reviews/${selectedReview.id}/reply`,
        encType: "application/json",
      },
    );
  };

  // Handle update completion
  const prevUpdateState = useRef(updateFetcher.state);
  useEffect(() => {
    if (
      prevUpdateState.current !== "idle" &&
      updateFetcher.state === "idle" &&
      updateFetcher.data
    ) {
      const data = updateFetcher.data as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      const shopify = (window as any).shopify;

      if (data.success) {
        if (shopify?.toast?.show) {
          shopify.toast.show("Review updated successfully");
        }
        onClose();
        revalidator.revalidate();
      } else {
        if (shopify?.toast?.show) {
          shopify.toast.show(data.error || "Failed to update review", {
            isError: true,
          });
        }
      }
    }
    prevUpdateState.current = updateFetcher.state;
  }, [updateFetcher.state, updateFetcher.data, revalidator, onClose]);

  // Handle reply completion
  const prevReplyState = useRef(replyFetcher.state);
  useEffect(() => {
    if (
      prevReplyState.current !== "idle" &&
      replyFetcher.state === "idle" &&
      replyFetcher.data
    ) {
      const data = replyFetcher.data as { success?: boolean; error?: string };
      const shopify = (window as any).shopify;

      if (data.success) {
        if (shopify?.toast?.show) {
          shopify.toast.show("Reply saved successfully");
        }
        revalidator.revalidate();
      } else {
        if (shopify?.toast?.show) {
          shopify.toast.show(data.error || "Failed to save reply", { isError: true });
        }
      }
    }
    prevReplyState.current = replyFetcher.state;
  }, [replyFetcher.state, replyFetcher.data, revalidator]);

  const selectStyle: React.CSSProperties = {
    width: "100%",
    marginTop: "4px",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid var(--s-color-border, #ccc)",
    fontSize: "14px",
    fontFamily: "inherit",
    background: "var(--s-color-bg-surface, #fff)",
    color: "inherit",
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <s-modal
      id="review-detail-modal"
      heading="Review Details"
      // @ts-expect-error web component props not in type definitions
      onClose={onClose}
    >
      {selectedReview && (<>
        <s-box padding="base">
          <s-stack gap="large">
            {/* Review images */}
            <s-box>
              <s-stack gap="small">
                <s-text><strong>Review Images</strong></s-text>
                {editImages.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {editImages.map((img, i) => (
                      <div
                        key={i}
                        style={{ position: "relative", display: "inline-block" }}
                      >
                        <img
                          src={img}
                          alt={`Review image ${i + 1}`}
                          style={{
                            width: "100px",
                            height: "100px",
                            borderRadius: "8px",
                            objectFit: "cover",
                            border: "1px solid var(--s-color-border)",
                            cursor: "pointer",
                            display: "block",
                          }}
                          onClick={() => window.open(img, "_blank")}
                        />
                        <button
                          onClick={() => handleRemoveImage(i)}
                          title="Remove image"
                          style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "50%",
                            width: "22px",
                            height: "22px",
                            cursor: "pointer",
                            fontSize: "14px",
                            lineHeight: "1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editImages.length === 0 && (
                  <s-text color="subdued">No images attached to this review.</s-text>
                )}

                {/* Upload image file */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                    id="review-image-upload"
                  />
                  <s-button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? "Uploading…" : "Upload Image"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>

            {/* Product info */}
            <s-stack direction="inline" gap="small" alignItems="center">
              {selectedReview.product.imageUrl && (
                <s-thumbnail
                  src={selectedReview.product.imageUrl}
                  alt={selectedReview.product.title}
                  size="small"
                />
              )}
              <s-stack gap="none">
                <s-text>
                  <strong>{selectedReview.product.title}</strong>
                </s-text>
                <s-text color="subdued">
                  Submitted {formatDate(selectedReview.createdAt.toString())}
                </s-text>
              </s-stack>
            </s-stack>

            <s-divider />

            {/* Customer Name + Email */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <s-text-field
                  label="Customer Name"
                  value={editForm.customerName}
                  onInput={(e: any) =>
                    setEditForm((prev) => ({
                      ...prev,
                      customerName: e.target.value,
                    }))
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <s-text-field
                  label="Customer Email"
                  value={editForm.customerEmail}
                  placeholder="No email provided"
                  onInput={(e: any) =>
                    setEditForm((prev) => ({
                      ...prev,
                      customerEmail: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Rating + Status */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <s-text><strong>Rating</strong></s-text>
                <select
                  value={String(editForm.rating)}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      rating: parseInt(e.target.value),
                    }))
                  }
                  style={selectStyle}
                >
                  <option value="5">5 stars</option>
                  <option value="4">4 stars</option>
                  <option value="3">3 stars</option>
                  <option value="2">2 stars</option>
                  <option value="1">1 star</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <s-text><strong>Status</strong></s-text>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                  style={selectStyle}
                >
                  <option value="pending">Pending</option>
                  <option value="published">Published</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            {/* Title */}
            <s-text-field
              label="Review Title"
              value={editForm.title}
              onInput={(e: any) =>
                setEditForm((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
            />

            {/* Content */}
            <s-stack gap="small">
              <s-text><strong>Review Content</strong></s-text>
              <textarea
                value={editForm.content}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--s-color-border, #ccc)",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </s-stack>

            {/* Verified badge */}
            {selectedReview.isVerified && (
              <s-badge tone="info">Verified Purchase</s-badge>
            )}
          </s-stack>
        </s-box>

        <s-box slot="footer">
          <s-stack
            direction="inline"
            gap="base"
            justifyContent="space-between"
          >
            <s-button variant="tertiary" onClick={onClose}>
              Cancel
            </s-button>
            <s-button
              variant="primary"
              onClick={handleSaveReview}
              disabled={updateFetcher.state !== "idle"}
            >
              {updateFetcher.state !== "idle" ? "Saving..." : "Save Changes"}
            </s-button>
          </s-stack>
        </s-box>
      </>)}
    </s-modal>
  );
}
