import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import DashboardKpiBar from "../components/dashboard-kpi-bar";
import TopProductsTable from "app/components/dashboard-top-products-table";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  const shopify = useAppBridge();

  return (
    <s-page heading="Dashboard" inlineSize="base">
      <DashboardKpiBar />
      <s-section>
        <s-stack gap="base">
          <s-heading>Needs attention</s-heading>
          {/* Alert Row 1 – Pending Reviews */}
          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
          >
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-icon type="alert-circle" tone="critical" />
              <s-text>15 reviews waiting moderation</s-text>
            </s-stack>
            <s-button>Review now</s-button>
          </s-stack>

          {/* Alert Row 2 – Low Ratings */}
          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
          >
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-icon type="alert-triangle" tone="warning" />
              <s-text>3 low-rated reviews need response</s-text>
            </s-stack>
            <s-button>Reply now</s-button>
          </s-stack>

          {/* Alert Row 3 – Automation Disabled */}
          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
          >
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-icon type="email" tone="caution" />
              <s-text>Review request email is not enabled</s-text>
            </s-stack>
            <s-button>Enable</s-button>
          </s-stack>

          {/* Alert Row 4 – Widget Missing */}
          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
          >
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-icon type="store" tone="caution" />
              <s-text>Review widget not added to theme</s-text>
            </s-stack>
            <s-button>Add widget</s-button>
          </s-stack>
        </s-stack>
      </s-section>
      <s-section>
        <s-heading>Top products</s-heading>
        <TopProductsTable />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
