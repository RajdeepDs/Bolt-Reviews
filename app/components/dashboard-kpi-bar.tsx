export default function DashboardKpiBar() {
  return (
    <s-section accessibilityLabel="KPI bar" padding="none">
      <s-stack direction="inline" gap="none" alignItems="stretch">
        <s-box padding="base" inlineSize="19.9%" minInlineSize="0">
          <s-stack direction="block" gap="small-100">
            <s-text color="subdued">Average rating</s-text>
            <s-heading>4.6</s-heading>
          </s-stack>
        </s-box>
        <s-divider direction="block" />
        <s-box padding="base" inlineSize="19.9%" minInlineSize="0">
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Total reviews</s-text>
            <s-heading>105</s-heading>
          </s-stack>
        </s-box>
        <s-divider direction="block" />
        <s-box padding="base" inlineSize="19.9%" minInlineSize="0">
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Pending reviews</s-text>
            <s-heading>15</s-heading>
          </s-stack>
        </s-box>
        <s-divider direction="block" />
        <s-box padding="base" inlineSize="19.9%" minInlineSize="0">
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Request sent (30 days)</s-text>
            <s-heading>90</s-heading>
          </s-stack>
        </s-box>
        <s-divider direction="block" />
        <s-box padding="base" inlineSize="19.9%" minInlineSize="0">
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Response rate</s-text>
            <s-heading>80%</s-heading>
          </s-stack>
        </s-box>
      </s-stack>
    </s-section>
  );
}
