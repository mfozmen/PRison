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

  it("uses keyExtractor when provided", () => {
    const items = ["alpha", "beta", "gamma"];
    render(
      <PrList
        title="Stuck PRs"
        items={items}
        emptyMessage="No stuck PRs right now."
        renderRow={(item) => <div data-testid="row">{item}</div>}
        keyExtractor={(item) => item}
      />,
    );
    expect(screen.getAllByTestId("row")).toHaveLength(3);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });
});

describe("PrList groupBy", () => {
  type Item = { repo: string; name: string };

  const items: Item[] = [
    { repo: "acme/alpha", name: "PR-1" },
    { repo: "acme/alpha", name: "PR-2" },
    { repo: "acme/beta", name: "PR-3" },
    { repo: "acme/gamma", name: "PR-4" },
    { repo: "acme/beta", name: "PR-5" },
  ];

  it("renders subheaders with correct group names", () => {
    render(
      <PrList
        title="All PRs"
        items={items}
        emptyMessage="No PRs."
        renderRow={(item) => <div data-testid="row">{item.name}</div>}
        groupBy={(item) => item.repo}
      />,
    );
    const headers = screen.getAllByTestId("group-header");
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts.some((t) => t?.includes("acme/alpha"))).toBe(true);
    expect(headerTexts.some((t) => t?.includes("acme/beta"))).toBe(true);
    expect(headerTexts.some((t) => t?.includes("acme/gamma"))).toBe(true);
  });

  it("renders the correct count per group in the subheader", () => {
    render(
      <PrList
        title="All PRs"
        items={items}
        emptyMessage="No PRs."
        renderRow={(item) => <div data-testid="row">{item.name}</div>}
        groupBy={(item) => item.repo}
      />,
    );
    // acme/alpha: 2, acme/beta: 2, acme/gamma: 1
    const headers = screen.getAllByTestId("group-header");
    const alphaHeader = headers.find((h) =>
      h.textContent?.includes("acme/alpha"),
    );
    const betaHeader = headers.find((h) =>
      h.textContent?.includes("acme/beta"),
    );
    const gammaHeader = headers.find((h) =>
      h.textContent?.includes("acme/gamma"),
    );
    expect(alphaHeader?.textContent).toContain("2");
    expect(betaHeader?.textContent).toContain("2");
    expect(gammaHeader?.textContent).toContain("1");
  });

  it("preserves incoming sort order within each group", () => {
    render(
      <PrList
        title="All PRs"
        items={items}
        emptyMessage="No PRs."
        renderRow={(item) => <div data-testid="row">{item.name}</div>}
        groupBy={(item) => item.repo}
      />,
    );
    const rows = screen.getAllByTestId("row").map((r) => r.textContent);
    // Within acme/alpha: PR-1 before PR-2
    expect(rows.indexOf("PR-1")).toBeLessThan(rows.indexOf("PR-2"));
    // Within acme/beta: PR-3 before PR-5
    expect(rows.indexOf("PR-3")).toBeLessThan(rows.indexOf("PR-5"));
  });

  it("orders groups by first appearance", () => {
    render(
      <PrList
        title="All PRs"
        items={items}
        emptyMessage="No PRs."
        renderRow={(item) => <div data-testid="row">{item.name}</div>}
        groupBy={(item) => item.repo}
      />,
    );
    const headers = screen.getAllByTestId("group-header");
    const headerTexts = headers.map((h) => h.textContent ?? "");
    const alphaIdx = headerTexts.findIndex((t) => t.includes("acme/alpha"));
    const betaIdx = headerTexts.findIndex((t) => t.includes("acme/beta"));
    const gammaIdx = headerTexts.findIndex((t) => t.includes("acme/gamma"));
    // acme/alpha appears first (index 0), acme/beta second (index 1), acme/gamma third (index 2)
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(gammaIdx);
  });

  it("renders flat list (no subheaders) when groupBy is omitted", () => {
    render(
      <PrList
        title="All PRs"
        items={items}
        emptyMessage="No PRs."
        renderRow={(item) => <div data-testid="row">{item.name}</div>}
      />,
    );
    expect(screen.queryAllByTestId("group-header")).toHaveLength(0);
    expect(screen.getAllByTestId("row")).toHaveLength(5);
  });

  it("shows a single subheader when groupBy is provided and all items share one group", () => {
    const singleGroupItems: Item[] = [
      { repo: "acme/alpha", name: "PR-1" },
      { repo: "acme/alpha", name: "PR-2" },
    ];
    render(
      <PrList
        title="All PRs"
        items={singleGroupItems}
        emptyMessage="No PRs."
        renderRow={(item) => <div data-testid="row">{item.name}</div>}
        groupBy={(item) => item.repo}
      />,
    );
    const headers = screen.getAllByTestId("group-header");
    expect(headers).toHaveLength(1);
    expect(headers[0].textContent).toContain("acme/alpha");
    expect(headers[0].textContent).toContain("2");
  });

  it("renders duplicate primitive items without losing rows when grouped", () => {
    const dupItems = ["a", "a", "b"];
    render(
      <PrList
        title="Letters"
        items={dupItems}
        emptyMessage="No letters."
        renderRow={(item) => <div data-testid="row">{item}</div>}
        groupBy={(item) => item}
      />,
    );
    // Both "a" rows must render even though they are === equal.
    expect(screen.getAllByTestId("row")).toHaveLength(3);
    const aHeader = screen
      .getAllByTestId("group-header")
      .find((h) => h.textContent?.startsWith("a"));
    expect(aHeader?.textContent).toContain("2");
  });

  it("shows emptyMessage when items is empty and groupBy is provided", () => {
    render(
      <PrList
        title="All PRs"
        items={[]}
        emptyMessage="No PRs here."
        renderRow={(item: Item) => <div data-testid="row">{item.name}</div>}
        groupBy={(item) => item.repo}
      />,
    );
    expect(screen.getByText("No PRs here.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("group-header")).toHaveLength(0);
  });
});
