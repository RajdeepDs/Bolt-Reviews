export default function ReviewsEmptyState() {
  return (
    <s-section>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <img
          src="/empty-state.svg"
          alt="No reviews yet"
          style={{ width: "200px", height: "200px", marginBottom: "24px" }}
        />
        <s-heading>Your reviews will show here</s-heading>
        <div style={{ marginTop: "8px", marginBottom: "24px", maxWidth: "400px" }}>
          <s-text color="subdued">
            This is where you'll manage all your product reviews. Import
            existing reviews or wait for customers to start leaving feedback.
          </s-text>
        </div>
        <s-button variant="primary" commandFor="import-modal">
          Import reviews
        </s-button>
      </div>
    </s-section>
  );
}
