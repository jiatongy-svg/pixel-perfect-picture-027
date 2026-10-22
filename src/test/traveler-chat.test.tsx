import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ load: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/messages.functions", () => ({ listTripMessages: "list", sendTripMessage: "send" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: string) => fn === "list" ? calls.load : calls.send }));
import { TravelerChat } from "@/components/trip/TravelerChat";
afterEach(cleanup);
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
describe("Traveler chat", () => {
  it("labels sample chat and saves locally without sending anything to a real recipient", async () => {
    render(<TravelerChat proposalId="sample-plan" sample />);
    fireEvent.click(screen.getByRole("button", { name: /Chat with travelers/ }));
    expect(screen.getByText(/no one receives them/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Message travelers"), { target: { value: "Meet at 9?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save demo message" }));
    await waitFor(() => expect(screen.getByText("Meet at 9?")).toBeVisible());
    expect(calls.send).not.toHaveBeenCalled();
    expect(calls.load).not.toHaveBeenCalled();
    expect(localStorage.getItem("tm_demo_chat_sample-plan")).toContain("Meet at 9?");
  });
  it("keeps an unsent real message and explains missing authentication", async () => {
    calls.load.mockRejectedValue(new Error("not signed in"));
    calls.send.mockRejectedValue(new Error("not signed in"));
    render(<TravelerChat proposalId="real-plan" sample={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Chat with travelers/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("verified sign-in");
    fireEvent.change(screen.getByLabelText("Message travelers"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Message was not sent"));
    expect(screen.getByLabelText("Message travelers")).toHaveValue("Hello");
  });
});
