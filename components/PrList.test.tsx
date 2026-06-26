import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrList } from "./PrList";

describe("PrList", () => {
  it("shows emptyMessage when items is empty", () => {
    render(
      <PrList
        title="Stuck PRs"
        items={[]}
        emptyMessage="No stuck PRs right now."
        renderRow={() => <div />}
      />,
    );
    expect(screen.getByText("No stuck PRs right now.")).toBeInTheDocument();
  });

  it("renders the correct number of rows when items are provided", () => {
    const items = ["alpha", "beta", "gamma"];
    render(
      <PrList
        title="Stuck PRs"
        items={items}
        emptyMessage="No stuck PRs right now."
        renderRow={(item) => <div key={item} data-testid="row">{item}</div>}
      />,
    );
    expect(screen.getAllByTestId("row")).toHaveLength(3);
  });
});
