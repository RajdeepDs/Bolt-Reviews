import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";

  const where: any = { shopId: session.shop };

  if (status !== "all") {
    where.status = status; // either pending, published, or rejected
  }

  const questions = await prisma.question.findMany({
    where,
    include: {
      product: {
        select: {
          title: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const statusCounts = await prisma.question.groupBy({
    by: ["status"],
    where: { shopId: session.shop },
    _count: { status: true },
  });

  const counts = { pending: 0, published: 0, rejected: 0, all: 0 };
  statusCounts.forEach((item: any) => {
    if (item.status === "pending") counts.pending = item._count.status;
    if (item.status === "published") counts.published = item._count.status;
    if (item.status === "rejected") counts.rejected = item._count.status;
  });
  counts.all = counts.pending + counts.published + counts.rejected;

  return { questions, counts, currentStatus: status };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const actionType = formData.get("actionType") as string;
  const questionId = formData.get("questionId") as string;

  if (!questionId) {
    return { error: "Missing Question ID" };
  }

  try {
    if (actionType === "saveAnswer") {
      const merchantAnswer = formData.get("merchantAnswer") as string;
      const forcePublish = formData.get("forcePublish") === "true";
      
      const payload: any = { 
        merchantAnswer,
        answeredAt: new Date()
      };
      
      if (forcePublish) {
        payload.status = "published";
      }

      await prisma.question.update({
        where: { id: questionId, shopId: session.shop },
        data: payload,
      });
      return { success: true, message: "Answer saved" };
    }

    if (actionType === "updateStatus") {
      const status = formData.get("status") as string;
      await prisma.question.update({
        where: { id: questionId, shopId: session.shop },
        data: { status },
      });
      return { success: true, message: `Question marked as ${status}` };
    }

    if (actionType === "delete") {
      await prisma.question.delete({
        where: { id: questionId, shopId: session.shop },
      });
      return { success: true, message: "Question deleted" };
    }

    return { error: "Invalid action" };
  } catch (error) {
    return { error: "Action failed" };
  }
};

export default function QnaPage() {
  const { questions, counts, currentStatus } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  // Modal State
  const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
  const [answerInput, setAnswerInput] = useState("");

  const handleFilterChange = (status: string) => {
    submit({ status }, { method: "get" });
  };

  const openAnswerModal = (q: any) => {
    setSelectedQuestion(q);
    setAnswerInput(q.merchantAnswer || "");
    // @ts-ignore
    document.getElementById("qna-modal")?.show();
  };

  const closeAnswerModal = () => {
    // @ts-ignore
    document.getElementById("qna-modal")?.hide();
    setSelectedQuestion(null);
    setAnswerInput("");
  };

  const handleSaveAnswer = (forcePublish: boolean) => {
    if (!selectedQuestion) return;
    
    submit(
      {
        actionType: "saveAnswer",
        questionId: selectedQuestion.id,
        merchantAnswer: answerInput,
        forcePublish: forcePublish ? "true" : "false",
      },
      { method: "post" }
    );
    closeAnswerModal();
    // @ts-ignore
    document.getElementById("toast-answer-saved")?.show();
  };

  const updateStatus = (id: string, newStatus: string) => {
    submit({ actionType: "updateStatus", questionId: id, status: newStatus }, { method: "post" });
  };

  const deleteQuestion = (id: string) => {
    // @ts-ignore
    if (confirm("Are you sure you want to delete this question forever?")) {
      submit({ actionType: "delete", questionId: id }, { method: "post" });
    }
  };

  const isLoading = navigation.state !== "idle";

  return (
    <s-page title="Product Q&A">
      <s-stack gap="400">
        
        {/* Header KPI cards */}
        <s-stack direction="inline" gap="400">
          <s-box padding="400" border="1px solid #dfe3e8" borderRadius="200" background="white" flex="1">
            <s-text variant="headingSm">Pending Answers</s-text>
            <s-text variant="heading3xl" color="critical">{counts.pending}</s-text>
          </s-box>
          <s-box padding="400" border="1px solid #dfe3e8" borderRadius="200" background="white" flex="1">
            <s-text variant="headingSm">Published</s-text>
            <s-text variant="heading3xl">{counts.published}</s-text>
          </s-box>
        </s-stack>

        {/* Filter Tabs */}
        <s-box padding="400" background="white" border="1px solid #dfe3e8" borderRadius="200">
          <s-stack direction="inline" gap="400" alignment="center">
            {["pending", "published", "rejected", "all"].map((tab) => (
              <s-button
                key={tab}
                variant={currentStatus === tab ? "primary" : "secondary"}
                onClick={() => handleFilterChange(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} ({counts[tab as keyof typeof counts]})
              </s-button>
            ))}
          </s-stack>
          
          <div style={{ marginTop: "20px" }}>
            {questions.length === 0 ? (
              <s-text>No questions found in this view.</s-text>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eee", textAlign: "left" }}>
                    <th style={{ padding: "12px 8px" }}>Status</th>
                    <th style={{ padding: "12px 8px" }}>Product</th>
                    <th style={{ padding: "12px 8px" }}>Question summary</th>
                    <th style={{ padding: "12px 8px" }}>Answered?</th>
                    <th style={{ padding: "12px 8px" }}>Date</th>
                    <th style={{ padding: "12px 8px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: isLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
                  {questions.map((q: any) => (
                    <tr key={q.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "12px 8px" }}>
                        <s-badge tone={q.status === 'published' ? 'success' : q.status === 'pending' ? 'attention' : 'critical'}>
                          {q.status}
                        </s-badge>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <s-stack direction="inline" alignment="center" gap="200">
                          {q.product.imageUrl && <s-thumbnail src={q.product.imageUrl} alt="img" size="small" />}
                          <s-text>{q.product.title}</s-text>
                        </s-stack>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <s-text variant="bodyMd" fontWeight="bold">{q.content.substring(0, 50)}{q.content.length > 50 ? '...' : ''}</s-text>
                        <s-text variant="bodySm" color="subdued">By {q.askerName}</s-text>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {q.merchantAnswer ? <span style={{ color: "green" }}>✓ Yes</span> : <span style={{ color: "red" }}>✕ No</span>}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {new Date(q.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <s-stack direction="inline" gap="200">
                          <s-button variant="secondary" onClick={() => openAnswerModal(q)}>Reply</s-button>
                          
                          {q.status === 'pending' && (
                            <s-button variant="primary" onClick={() => updateStatus(q.id, 'published')}>Approve</s-button>
                          )}
                          
                          {q.status === 'published' && (
                            <s-button variant="secondary" onClick={() => updateStatus(q.id, 'pending')}>Hide</s-button>
                          )}
                          
                          <s-button tone="critical" onClick={() => deleteQuestion(q.id)}>Delete</s-button>
                        </s-stack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </s-box>
      </s-stack>

      {/* Answer Modal */}
      <s-modal id="qna-modal" title="Answer Customer Question">
        {selectedQuestion && (
          <s-box padding="400">
            <s-stack gap="400">
              <s-box padding="300" background="#f4f6f8" borderRadius="100">
                <s-text variant="headingSm">Product: {selectedQuestion.product.title}</s-text>
                <div style={{ marginTop: '10px' }}>
                  <s-text variant="bodyMd"><strong>{selectedQuestion.askerName}</strong> asks:</s-text>
                  <p style={{ fontStyle: "italic", margin: "5px 0" }}>"{selectedQuestion.content}"</p>
                </div>
              </s-box>

              <label style={{ display: "block", marginTop: "10px", fontWeight: "bold" }}>Your Answer (Public)</label>
              <textarea
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "12px",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  fontFamily: "inherit"
                }}
                placeholder="Type your official answer here..."
              />
              
              <s-stack direction="inline" gap="200" alignment="center">
                <s-button variant="primary" onClick={() => handleSaveAnswer(selectedQuestion.status === 'pending')}>
                  {selectedQuestion.status === 'pending' ? 'Save & Publish' : 'Save Answer'}
                </s-button>
                <s-button variant="secondary" onClick={closeAnswerModal}>Cancel</s-button>
              </s-stack>
            </s-stack>
          </s-box>
        )}
      </s-modal>
      
      {/* Toast */}
      {/* @ts-ignore */}
      <s-toast id="toast-answer-saved" content="Answer saved successfully"></s-toast>

    </s-page>
  );
}

export function ErrorBoundary() {
  return (
    <s-page title="Product Q&A">
      <s-box padding="400" background="white" border="1px solid #dfe3e8" borderRadius="200">
        <s-text variant="headingLg" color="critical">Something went wrong</s-text>
        <div style={{ marginTop: '10px' }}>
          <s-text>The Q&A page could not be loaded. Please try refreshing.</s-text>
        </div>
      </s-box>
    </s-page>
  );
}
