import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import { makeProject, makeVideoCandidate } from "./test-utils/factories";

describe("store.setProject", () => {
  beforeEach(() => {
    useStore.setState({
      project: null,
      currentIndex: 0,
      searchResults: {},
      downloads: {},
    });
  });

  it("clears point-keyed transient maps when switching to a different project", () => {
    const { setProject, setSearchResults, setCurrentIndex } = useStore.getState();
    setProject(makeProject({ slug: "project-one" }));
    setCurrentIndex(2);
    setSearchResults("bp_01", [makeVideoCandidate("v1")]);
    expect(useStore.getState().searchResults["bp_01"]).toHaveLength(1);

    // A different project reuses the same bp_01/bp_02 ids — the previous
    // project's cached results must not leak onto them.
    setProject(makeProject({ slug: "project-two" }));
    expect(useStore.getState().searchResults).toEqual({});
    expect(useStore.getState().currentIndex).toBe(0);
  });

  it("preserves transient maps across a same-slug refresh", () => {
    const { setProject, setSearchResults } = useStore.getState();
    setProject(makeProject({ slug: "project-one", name: "Before" }));
    setSearchResults("bp_01", [makeVideoCandidate("v1")]);

    // Polling refresh / project:updated emit replaces the project object but
    // keeps the same slug — in-flight search results must survive.
    setProject(makeProject({ slug: "project-one", name: "After" }));
    expect(useStore.getState().project?.name).toBe("After");
    expect(useStore.getState().searchResults["bp_01"]).toHaveLength(1);
  });
});
