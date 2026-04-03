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
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    rating: 0,
    status: "",
    customerName: "",
    customerEmail: "",
  });

  // Sync form state when selectedReview changes
  useEffect(() => {
    if (selectedReview) {
      setReplyText(selectedReview.merchantReply || "");
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
            {(selectedReview.images?.length > 0 || selectedReview.imageUrl) && (
              <s-box>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {selectedReview.images?.length > 0
                    ? selectedReview.images.map((img: string, i: number) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Review image ${i + 1}`}
                        style={{
                          width: "120px",
                          height: "120px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          border: "1px solid var(--s-color-border)",
                        }}
                        onClick={() => window.open(img, "_blank")}
                      />
                    ))
                    : selectedReview.imageUrl && (
                      <img
                        src={selectedReview.imageUrl}
                        alt="Review image"
                        style={{
                          width: "120px",
                          height: "120px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          border: "1px solid var(--s-color-border)",
                        }}
                        onClick={() => window.open(selectedReview.imageUrl!, "_blank")}
                      />
                    )}
                </div>
              </s-box>
            )}

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
