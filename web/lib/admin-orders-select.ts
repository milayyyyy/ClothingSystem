/** Admin orders list: primary assignee + group assignees + store (requires migration 032 for assignees). */
export const ADMIN_ORDERS_SELECT =
  "*, assigned:assigned_to(id, full_name, email), assignees:order_assignees(user_id, profiles:user_id(full_name,email)), store:stores(id,name)";
