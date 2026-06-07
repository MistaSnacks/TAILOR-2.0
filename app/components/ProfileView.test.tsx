// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ProfileView } from "./ProfileView";

test("renders an experience with its company and a grouped bullet", () => {
  render(
    <ProfileView
      basics={{ name: "Camren McMath" }}
      experiences={[
        { company: "TD Bank", position: "Fraud Analyst", highlights: ["Investigated escalated fraud disputes"] },
      ]}
      skills={[]}
      education={[]}
    />,
  );
  expect(screen.getByText("TD Bank")).toBeInTheDocument();
  expect(screen.getByText(/investigated escalated fraud/i)).toBeInTheDocument();
});

test("shows empty state when there is no profile", () => {
  render(<ProfileView basics={null} experiences={[]} skills={[]} education={[]} />);
  expect(screen.getByText(/no profile yet/i)).toBeInTheDocument();
});
