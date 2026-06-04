// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FormExplorer } from "./FormExplorer";

test("renders a thread with its source provenance", () => {
  render(
    <FormExplorer
      threads={[{ id: "t1", text: "Built Tableau dashboards", sources: ["resume.pdf"] }]}
      skills={[]}
    />,
  );
  expect(screen.getByText("Built Tableau dashboards")).toBeInTheDocument();
  expect(screen.getByText(/resume\.pdf/)).toBeInTheDocument();
});

test("shows empty state when the Form has no threads", () => {
  render(<FormExplorer threads={[]} skills={[]} />);
  expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
});
