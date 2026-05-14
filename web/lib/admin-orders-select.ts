/** Admin orders list: primary assignee + group assignees + store + job type (migration 056). */
export const ADMIN_ORDERS_SELECT =
  "*, assigned:assigned_to(id, full_name, email), assignees:order_assignees(user_id, profiles:user_id(full_name,email)), store:stores(id,name), job_type:job_type_id(id,name)";
