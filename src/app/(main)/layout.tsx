import { BottomNav } from "@/components/layout/BottomNav";

/** Layout for the four primary tabs: adds the bottom navigation. */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main>{children}</main>
      <BottomNav />
    </>
  );
}
