// Before / after jobs shown on the home page, first one opens by default.
// To add a job: put a "before" and an "after" photo of the same spot in this folder (same angle works best) and add a line below.
//   service: "install" | "clean" | "replace"
//   sample: true marks a placeholder; the site shows a small "Sample" tag on it. Delete these once you have real jobs.
window.BEFORE_AFTER = [
  { title: "Crumbling stack rebuilt", service: "replace", before: "before-after/job1-before.webp", after: "before-after/job1-after.webp", sample: true },
  { title: "New crown and flashing", service: "replace", before: "before-after/job2-before.webp", after: "before-after/job2-after.webp", sample: true },
  { title: "Soot-choked flue swept", service: "clean", before: "before-after/job3-before.webp", after: "before-after/job3-after.webp", sample: true },
  { title: "Failed masonry replaced", service: "replace", before: "before-after/job4-before.webp", after: "before-after/job4-after.webp", sample: true },
  { title: "Chimney built from scratch", service: "install", before: "before-after/job5-before.webp", after: "before-after/job5-after.webp", sample: true }
];
