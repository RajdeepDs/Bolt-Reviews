import { useState, useEffect } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import DevelopmentStoreBanner from "../components/development-store-banner";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Get or create default settings
  let settings = await prisma.settings.findUnique({
    where: { shopId: session.shop },
  });

  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        shopId: session.shop,
        autoPublish: true,
        autoImportPublish: true,
        requireModeration: true,
        allowGuestReviews: true,
        requireVerifiedPurchase: false,
        minRatingToPublish: 1,
        enableReviewImages: true,
        emailNotifications: true,
      },
    });
  }

  return {
    settings,
    hasActiveSubscription: (settings as any)?.subscriptionStatus === "active",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  try {
    const settings = await prisma.settings.upsert({
      where: { shopId: session.shop },
      update: {
        autoPublish: formData.get("autoPublish") === "true",
        autoImportPublish: formData.get("autoImportPublish") === "true",
        requireModeration: formData.get("requireModeration") === "true",
        allowGuestReviews: formData.get("allowGuestReviews") === "true",
        requireVerifiedPurchase:
          formData.get("requireVerifiedPurchase") === "true",
        minRatingToPublish: parseInt(
          (formData.get("minRatingToPublish") as string) || "1",
        ),
        enableReviewImages: formData.get("enableReviewImages") === "true",
        emailNotifications: formData.get("emailNotifications") === "true",
        notificationEmail:
          (formData.get("notificationEmail") as string) || null,
      },
      create: {
        shopId: session.shop,
        autoPublish: formData.get("autoPublish") === "true",
        autoImportPublish: formData.get("autoImportPublish") === "true",
        requireModeration: formData.get("requireModeration") === "true",
        allowGuestReviews: formData.get("allowGuestReviews") === "true",
        requireVerifiedPurchase:
          formData.get("requireVerifiedPurchase") === "true",
        minRatingToPublish: parseInt(
          (formData.get("minRatingToPublish") as string) || "1",
        ),
        enableReviewImages: formData.get("enableReviewImages") === "true",
        emailNotifications: formData.get("emailNotifications") === "true",
        notificationEmail:
          (formData.get("notificationEmail") as string) || null,
      },
    });

    return { success: true, settings };
  } catch (error) {
    console.error("Error updating settings:", error);
    return { success: false, error: (error as Error).message };
  }
};

export default function SettingsIndex() {
  const { settings, hasActiveSubscription } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [formState, setFormState] = useState({
    autoPublish: settings.autoPublish,
    autoImportPublish: (settings as any).autoImportPublish ?? true,
    requireModeration: settings.requireModeration,
    allowGuestReviews: settings.allowGuestReviews,
    requireVerifiedPurchase: settings.requireVerifiedPurchase,
    minRatingToPublish: settings.minRatingToPublish,
    enableReviewImages: settings.enableReviewImages,
    emailNotifications: settings.emailNotifications,
    notificationEmail: settings.notificationEmail || "",
  });

  const [isDirty, setIsDirty] = useState(false);

  // Track if any field changed from the saved state
  useEffect(() => {
    const changed =
      formState.autoPublish !== settings.autoPublish ||
      formState.autoImportPublish !== ((settings as any).autoImportPublish ?? true) ||
      formState.requireModeration !== settings.requireModeration ||
      formState.allowGuestReviews !== settings.allowGuestReviews ||
      formState.requireVerifiedPurchase !== settings.requireVerifiedPurchase ||
      formState.minRatingToPublish !== settings.minRatingToPublish ||
      formState.enableReviewImages !== settings.enableReviewImages ||
      formState.emailNotifications !== settings.emailNotifications ||
      formState.notificationEmail !== (settings.notificationEmail || "");
    setIsDirty(changed);
  }, [formState, settings]);

  // Show toast on successful save
  useEffect(() => {
    if (navigation.state === "idle" && !isSubmitting) {
      // Check if we just finished submitting
    }
  }, [navigation.state, isSubmitting]);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("autoPublish", String(formState.autoPublish));
    formData.append("autoImportPublish", String(formState.autoImportPublish));
    formData.append("requireModeration", String(formState.requireModeration));
    formData.append("allowGuestReviews", String(formState.allowGuestReviews));
    formData.append(
      "requireVerifiedPurchase",
      String(formState.requireVerifiedPurchase),
    );
    formData.append("minRatingToPublish", String(formState.minRatingToPublish));
    formData.append("enableReviewImages", String(formState.enableReviewImages));
    formData.append("emailNotifications", String(formState.emailNotifications));
    formData.append("notificationEmail", formState.notificationEmail);

    submit(formData, { method: "post" });

    const shopify = (window as any).shopify;
    if (shopify?.toast?.show) {
      shopify.toast.show("Settings saved successfully");
    }
  };

  const handleDiscard = () => {
    setFormState({
      autoPublish: settings.autoPublish,
      autoImportPublish: (settings as any).autoImportPublish ?? true,
      requireModeration: settings.requireModeration,
      allowGuestReviews: settings.allowGuestReviews,
      requireVerifiedPurchase: settings.requireVerifiedPurchase,
      minRatingToPublish: settings.minRatingToPublish,
      enableReviewImages: settings.enableReviewImages,
      emailNotifications: settings.emailNotifications,
      notificationEmail: settings.notificationEmail || "",
    });
  };

  const updateField = (field: string, value: any) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <DevelopmentStoreBanner hasActiveSubscription={hasActiveSubscription} />
      <s-page heading="Settings" inlineSize="base">
        {isDirty && (
          <>
            <s-button
              slot="primary-action"
              variant="primary"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save"}
            </s-button>
            <s-button
              slot="secondary-actions"
              onClick={handleDiscard}
              disabled={isSubmitting}
            >
              Discard
            </s-button>
          </>
        )}

        {/* Review Moderation */}
        <s-section heading="Review Moderation">
          <s-box padding="base">
            <s-stack gap="large">
              <s-stack gap="small">
                <s-checkbox
                  label="Auto-publish reviews"
                  checked={formState.autoPublish}
                  onInput={(e: any) =>
                    updateField("autoPublish", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  Automatically publish new reviews without manual moderation.
                  When enabled, reviews meeting the minimum rating will be
                  published immediately.
                </s-text>
              </s-stack>

              <s-stack gap="small">
                <s-checkbox
                  label="Require moderation"
                  checked={formState.requireModeration}
                  onInput={(e: any) =>
                    updateField("requireModeration", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  All reviews must be manually approved before appearing on your
                  storefront.
                </s-text>
              </s-stack>

              {formState.autoPublish && (
                <s-stack gap="small">
                  <s-text>
                    <strong>Minimum rating to auto-publish</strong>
                  </s-text>
                  <select
                    value={String(formState.minRatingToPublish)}
                    onChange={(e) =>
                      updateField(
                        "minRatingToPublish",
                        parseInt(e.target.value),
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--s-color-border, #ccc)",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      background: "var(--s-color-bg-surface, #fff)",
                      color: "inherit",
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="1">1 star and above (all reviews)</option>
                    <option value="2">2 stars and above</option>
                    <option value="3">3 stars and above</option>
                    <option value="4">4 stars and above</option>
                    <option value="5">5 stars only</option>
                  </select>
                  <s-text color="subdued">
                    Reviews below this rating will be held for moderation.
                  </s-text>
                </s-stack>
              )}
            </s-stack>
          </s-box>
        </s-section>

        {/* Review Import */}
        <s-section heading="Review Import">
          <s-box padding="base">
            <s-stack gap="large">
              <s-stack gap="small">
                <s-checkbox
                  label="Auto-publish imported reviews"
                  checked={formState.autoImportPublish}
                  onInput={(e: any) =>
                    updateField("autoImportPublish", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  When enabled, reviews imported via CSV will be automatically
                  published instead of held as pending for moderation.
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>

        {/* Review Submission */}
        <s-section heading="Review Submission">
          <s-box padding="base">
            <s-stack gap="large">
              <s-stack gap="small">
                <s-checkbox
                  label="Allow guest reviews"
                  checked={formState.allowGuestReviews}
                  onInput={(e: any) =>
                    updateField("allowGuestReviews", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  Allow customers to leave reviews without being logged in.
                </s-text>
              </s-stack>

              <s-stack gap="small">
                <s-checkbox
                  label="Require verified purchase"
                  checked={formState.requireVerifiedPurchase}
                  onInput={(e: any) =>
                    updateField("requireVerifiedPurchase", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  Only customers who have purchased the product can leave a
                  review.
                </s-text>
              </s-stack>

              <s-stack gap="small">
                <s-checkbox
                  label="Enable review photos"
                  checked={formState.enableReviewImages}
                  onInput={(e: any) =>
                    updateField("enableReviewImages", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  Allow customers to upload photos with their reviews.
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>

        {/* Notifications */}
        <s-section heading="Notifications">
          <s-box padding="base">
            <s-stack gap="large">
              <s-stack gap="small">
                <s-checkbox
                  label="Email notifications for new reviews"
                  checked={formState.emailNotifications}
                  onInput={(e: any) =>
                    updateField("emailNotifications", e.target.checked)
                  }
                />
                <s-text color="subdued">
                  Receive an email notification when a new review is submitted.
                </s-text>
              </s-stack>

              {formState.emailNotifications && (
                <s-text-field
                  label="Notification email"
                  value={formState.notificationEmail}
                  placeholder="your@email.com"
                  onInput={(e: any) =>
                    updateField("notificationEmail", e.target.value || "")
                  }
                />
              )}
            </s-stack>
          </s-box>
        </s-section>
      </s-page>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
