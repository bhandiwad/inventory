const messages: Record<string, string> = {
  authentication_required: "Please sign in again.",
  custom_product_not_found: "This custom product is no longer available for promotion.",
  insufficient_stock_write_role: "This user cannot update stock.",
  insufficient_tenant_read_role: "This user cannot read this shop's reports.",
  insufficient_tenant_role: "Owner access is required for this action.",
  invalid_report_range: "Choose a valid report date range.",
  missing_stock_adjustment_sheet: "Use the app-generated stock adjustment Excel file.",
  not_app_generated_template: "This Excel file is not an app-generated stock adjustment template.",
  platform_admin_required: "Platform admin access is required.",
  unknown_category_code: "Choose a known product type before creating this product.",
  viewer_or_role_cannot_queue_mutations: "View-only users cannot update stock, including offline."
};

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again.") {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const key = Object.keys(messages).find((item) => raw.includes(item));
  if (key) return messages[key];
  if (raw.includes("JWT") || raw.includes("session")) return "Your session expired. Please sign in again.";
  if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) return "Network connection failed. Check internet and try again.";
  return raw || fallback;
}
