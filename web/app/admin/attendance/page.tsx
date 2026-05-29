import { PageHeader } from "@/components/page-header";
import { AttendancePageContent } from "./attendance-page-content";

export default function AdminAttendancePage() {
  return (
    <div>
      <PageHeader title="Attendance" description="Add or edit employee time in/out; salary uses these times for hourly and day-based pay." />
      <AttendancePageContent />
    </div>
  );
}
