interface DevelopmentStoreBannerProps {
  hasActiveSubscription: boolean;
}

export default function DevelopmentStoreBanner({
  hasActiveSubscription,
}: DevelopmentStoreBannerProps) {
  if (hasActiveSubscription) {
    return null;
  }

  return (
    <div
      style={{
        background: "#fef9e7",
        borderBottom: "1px solid #f5e6b3",
        padding: "12px 24px",
        textAlign: "center",
        color: "#1f2937",
      }}
    >
      <s-text>
        This app is free for development stores. When your store goes live, all
        reviews will be hidden until you choose a plan and approve subscription.
      </s-text>
    </div>
  );
}
