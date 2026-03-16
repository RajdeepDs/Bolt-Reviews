/**
 * Stub utility for sending emails.
 * In a real production app, this would use Resend, SendGrid, Amazon SES, etc.
 * For this MVP, we simulate sending an email by logging to the console.
 */

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  console.log("==================================================");
  console.log(`📧 SIMULATED EMAIL SENT TO: ${to}`);
  console.log(`📧 SUBJECT: ${subject}`);
  console.log(`📧 BODY: \n${html.replace(/<[^>]*>?/gm, '')}`); // Log basic text
  console.log("==================================================");
  
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  return { success: true };
}
