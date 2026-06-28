import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import ForceGraph3D from '3d-force-graph';
import type { Person, PersonRelationships } from '../types/family';

type GraphNode = {
  id: string;
  name: string;
  nuclearFamilyId: string;
  dob?: string;
  phone: string;
  color: string;
  connectionCount: number;
  relationships: PersonRelationships;
  x?: number;
  y?: number;
  z?: number;
};

type GraphLink = {
  source: string;
  target: string;
  type: 'parent-child' | 'partner';
};

type FamilyTreeData = {
  people: Person[];
};

type PublicFamilyDataset = {
  metadata: {
    familyName: string;
  };
  people: Person[];
};

type FamilyGraphClientProps = {
  familyName: string;
  familyId: string;
  people: Person[];
};

const DEFAULT_NODE_COLOR = '#6e8647';
const FAMILY_COLORS = ['#486b41', '#6e8647', '#7f6a49', '#58713e', '#8a6a49', '#4d693c', '#927456'];
const BIRTHDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: '2-digit',
  year: 'numeric'
});

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function clonePerson(person: Person): Person {
  return {
    ...person,
    relationships: {
      parents: [...person.relationships.parents],
      children: [...person.relationships.children],
      partners: [...person.relationships.partners]
    }
  };
}

function normalizeRelationships(person: Person): Person {
  return {
    ...person,
    relationships: {
      parents: unique(person.relationships.parents.filter((id) => id !== person.id)),
      children: unique(person.relationships.children.filter((id) => id !== person.id)),
      partners: unique(person.relationships.partners.filter((id) => id !== person.id))
    }
  };
}

function buildFamilyColorMap(people: Person[]) {
  const familyColorMap = new Map<string, string>();
  let nextColorIndex = 0;

  for (const person of people) {
    if (familyColorMap.has(person.nuclearFamilyId)) continue;

    familyColorMap.set(
      person.nuclearFamilyId,
      person.color?.trim() || FAMILY_COLORS[nextColorIndex % FAMILY_COLORS.length] || DEFAULT_NODE_COLOR
    );
    nextColorIndex += 1;
  }

  return familyColorMap;
}

function generatePersonId(familyId: string, currentPeople: Person[]) {
  const prefix = `${familyId}-p`;
  const nextNumber =
    currentPeople.reduce((highest, person) => {
      if (!person.id.startsWith(prefix)) return highest;

      const parsed = Number.parseInt(person.id.slice(prefix.length), 10);
      return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
    }, 0) + 1;

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

function parseDateParts(dob?: string) {
  if (!dob) return null;

  const [year, month, day] = dob.split('-').map((value) => Number.parseInt(value, 10));
  if (!year || !month || !day) return null;

  return { year, month, day };
}

function formatBirthday(dob?: string) {
  const parts = parseDateParts(dob);
  if (!parts) return 'Unknown';

  return BIRTHDAY_FORMATTER.format(new Date(parts.year, parts.month - 1, parts.day));
}

function daysUntilBirthday(dob: string | undefined, now: Date) {
  const parts = parseDateParts(dob);
  if (!parts) return Number.POSITIVE_INFINITY;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let nextBirthday = new Date(today.getFullYear(), parts.month - 1, parts.day);

  if (nextBirthday < today) {
    nextBirthday = new Date(today.getFullYear() + 1, parts.month - 1, parts.day);
  }

  return Math.round((nextBirthday.getTime() - today.getTime()) / 86400000);
}

function removeRelationshipReference(person: Person, referencedId: string): Person {
  return normalizeRelationships({
    ...person,
    relationships: {
      parents: person.relationships.parents.filter((id) => id !== referencedId),
      children: person.relationships.children.filter((id) => id !== referencedId),
      partners: person.relationships.partners.filter((id) => id !== referencedId)
    }
  });
}

function applyReciprocalRelationships(people: Person[]) {
  const nextPeople = people.map((person) => normalizeRelationships(clonePerson(person)));
  const byId = new Map(nextPeople.map((person) => [person.id, person]));

  for (const person of nextPeople) {
    for (const parentId of person.relationships.parents) {
      const parent = byId.get(parentId);
      if (parent) parent.relationships.children = unique([...parent.relationships.children, person.id]);
    }

    for (const childId of person.relationships.children) {
      const child = byId.get(childId);
      if (child) child.relationships.parents = unique([...child.relationships.parents, person.id]);
    }

    for (const partnerId of person.relationships.partners) {
      const partner = byId.get(partnerId);
      if (partner) partner.relationships.partners = unique([...partner.relationships.partners, person.id]);
    }
  }

  return nextPeople.map((person) => normalizeRelationships(person));
}

function buildGraphData(data: FamilyTreeData): { nodes: GraphNode[]; links: GraphLink[] } {
  const personIds = new Set(data.people.map((person) => person.id));
  const familyColorMap = buildFamilyColorMap(data.people);

  const nodes = data.people.map((person) => {
    const relationships = normalizeRelationships(person).relationships;

    return {
      id: person.id,
      name: person.name,
      nuclearFamilyId: person.nuclearFamilyId,
      dob: person.dob,
      phone: person.phone,
      color: familyColorMap.get(person.nuclearFamilyId) ?? DEFAULT_NODE_COLOR,
      connectionCount:
        relationships.parents.length + relationships.children.length + relationships.partners.length,
      relationships
    };
  });

  const links: GraphLink[] = [];
  const parentChildSeen = new Set<string>();
  const partnerSeen = new Set<string>();

  for (const person of data.people) {
    const relationships = normalizeRelationships(person).relationships;

    for (const parentId of relationships.parents) {
      if (!personIds.has(parentId)) continue;

      const key = `${parentId}->${person.id}`;
      if (parentChildSeen.has(key)) continue;

      parentChildSeen.add(key);
      links.push({
        source: parentId,
        target: person.id,
        type: 'parent-child'
      });
    }

    for (const childId of relationships.children) {
      if (!personIds.has(childId)) continue;

      const key = `${person.id}->${childId}`;
      if (parentChildSeen.has(key)) continue;

      parentChildSeen.add(key);
      links.push({
        source: person.id,
        target: childId,
        type: 'parent-child'
      });
    }

    for (const partnerId of relationships.partners) {
      if (!personIds.has(partnerId)) continue;

      const key = [person.id, partnerId].sort().join('::');
      if (partnerSeen.has(key)) continue;

      partnerSeen.add(key);
      links.push({
        source: person.id,
        target: partnerId,
        type: 'partner'
      });
    }
  }

  return { nodes, links };
}

export default function FamilyGraphClient(props: FamilyGraphClientProps) {
  const ADD_DIALOG_ANIMATION_MS = 240;

  let container!: HTMLDivElement;
  let searchInput!: HTMLInputElement;
  let personDialog!: HTMLDialogElement;
  let addDialog!: HTMLDialogElement;
  let addForm!: HTMLFormElement;

  const [ready, setReady] = createSignal(false);
  const [people, setPeople] = createSignal(props.people.map((person) => normalizeRelationships(clonePerson(person))));
  const [searchTerm, setSearchTerm] = createSignal('');
  const [searchError, setSearchError] = createSignal('');
  const [addError, setAddError] = createSignal('');
  const [addDialogClosing, setAddDialogClosing] = createSignal(false);
  const [selectedPerson, setSelectedPerson] = createSignal<GraphNode | null>(null);
  const [personEditMode, setPersonEditMode] = createSignal(false);
  const [personEditError, setPersonEditError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal('Saved');
  const [birthdaysExpanded, setBirthdaysExpanded] = createSignal(false);
  const upcomingBirthdays = createMemo(() => {
    const now = new Date();

    return people()
      .filter((person) => Boolean(parseDateParts(person.dob)))
      .map((person) => ({
        id: person.id,
        name: person.name,
        formattedDob: formatBirthday(person.dob),
        daysAway: daysUntilBirthday(person.dob, now)
      }))
      .sort((left, right) => left.daysAway - right.daysAway || left.name.localeCompare(right.name))
      .slice(0, 5);
  });

  let graph: ReturnType<ReturnType<typeof ForceGraph3D>> | null = null;
  let graphNodes: GraphNode[] = [];
  const highlightTimers = new Map<string, number>();

  const getPersonName = (personId: string) => people().find((person) => person.id === personId)?.name ?? personId;

  const formatRelationshipNames = (personIds: string[]) => personIds.map((personId) => getPersonName(personId)).join(', ');

  const savePeople = async (nextPeople: Person[], setFormError: (message: string) => void) => {
    setSaving(true);
    setSaveStatus('Saving...');

    try {
      const response = await fetch(`/api/families/${encodeURIComponent(props.familyId)}.json`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ people: nextPeople })
      });
      const payload = (await response.json().catch(() => null)) as
        | (Partial<PublicFamilyDataset> & { error?: string })
        | null;

      if (!response.ok || !payload?.people) {
        throw new Error(payload?.error || 'The family tree could not be saved.');
      }

      const savedPeople = payload.people.map((person) => normalizeRelationships(clonePerson(person)));
      setPeople(savedPeople);
      setSaveStatus('Saved');
      return savedPeople;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The family tree could not be saved.';
      setFormError(message);
      setSaveStatus('Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const clearHighlightTimer = (nodeId: string) => {
    const timerId = highlightTimers.get(nodeId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      highlightTimers.delete(nodeId);
    }
  };

  const flashNode = (node: GraphNode) => {
    if (!graph) return;

    const originalColor = node.color;
    clearHighlightTimer(node.id);
    node.color = '#f3e9d2';
    graph.refresh();

    const timerId = window.setTimeout(() => {
      node.color = originalColor;
      graph?.refresh();
      highlightTimers.delete(node.id);
    }, 1600);

    highlightTimers.set(node.id, timerId);
  };

  const focusNode = (node: GraphNode) => {
    if (!graph) return;

    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const z = node.z ?? 0;
    const distance = 140;
    const magnitude = Math.hypot(x, y, z);
    const direction =
      magnitude === 0
        ? { x: 0, y: 0.25, z: 1 }
        : { x: x / magnitude, y: y / magnitude, z: z / magnitude };

    graph.cameraPosition(
      {
        x: x + direction.x * distance,
        y: y + direction.y * distance,
        z: z + direction.z * distance
      },
      { x, y, z },
      1200
    );
  };

  const openPersonDialog = (node: GraphNode) => {
    setPersonEditMode(false);
    setPersonEditError('');
    setSelectedPerson(node);
    if (!personDialog.open) {
      personDialog.showModal();
    }
  };

  const closePersonDialog = () => {
    if (personDialog.open) {
      personDialog.close();
    }
    setPersonEditMode(false);
    setPersonEditError('');
    setSelectedPerson(null);
  };

  const openAddDialog = () => {
    setAddError('');
    setAddDialogClosing(false);
    if (!addDialog.open) {
      addDialog.showModal();
    }
  };

  const closeAddDialog = () => {
    if (!addDialog.open || addDialogClosing()) return;

    setAddDialogClosing(true);
    window.setTimeout(() => {
      if (addDialog.open) {
        addDialog.close();
      }
      setAddDialogClosing(false);
      setAddError('');
    }, ADD_DIALOG_ANIMATION_MS);
  };

  const handleNodeSelection = (node: GraphNode) => {
    flashNode(node);
    openPersonDialog(node);
  };

  const handleSearch = (event: SubmitEvent) => {
    event.preventDefault();

    const query = searchTerm().trim().toLowerCase();
    if (!query) {
      setSearchError('Enter a name to search the graph.');
      searchInput.focus();
      return;
    }

    const match = graphNodes.find((node) => node.name.toLowerCase().includes(query));
    if (!match) {
      setSearchError(`No family member found for "${searchTerm().trim()}".`);
      return;
    }

    setSearchError('');
    focusNode(match);
    flashNode(match);
  };

  const handleAddNode = async (event: SubmitEvent) => {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const nextName = String(formData.get('name') ?? '').trim();
    const nextFamilyId = String(formData.get('nuclearFamilyId') ?? '').trim();
    const nextDob = String(formData.get('dob') ?? '').trim();
    const nextPhone = String(formData.get('phone') ?? '').trim();

    if (!nextName || !nextFamilyId) {
      setAddError('Name and nuclear family ID are required.');
      return;
    }

    const currentPeople = people().map((person) => normalizeRelationships(clonePerson(person)));
    const existingIds = new Set(currentPeople.map((person) => person.id));
    const nextId = generatePersonId(props.familyId, currentPeople);
    const parents = unique(formData.getAll('parents').map((value) => String(value)));
    const children = unique(formData.getAll('children').map((value) => String(value)));
    const partners = unique(formData.getAll('partners').map((value) => String(value)));
    const missingIds = [...parents, ...children, ...partners].filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      setAddError(`Unknown relationship selections: ${missingIds.join(', ')}`);
      return;
    }

    const newPerson = normalizeRelationships({
      id: nextId,
      name: nextName,
      nuclearFamilyId: nextFamilyId,
      dob: nextDob || undefined,
      phone: nextPhone,
      relationships: {
        parents,
        children,
        partners
      }
    });

    const normalizedPeople = applyReciprocalRelationships([...currentPeople, newPerson]);
    const savedPeople = await savePeople(normalizedPeople, setAddError);
    if (!savedPeople) return;

    setAddError('');
    addForm.reset();
    closeAddDialog();

    window.setTimeout(() => {
      const addedNode = graphNodes.find((node) => node.id === newPerson.id);
      if (!addedNode) return;

      focusNode(addedNode);
      flashNode(addedNode);
      openPersonDialog(addedNode);
    }, 120);
  };

  const handleEditNode = async (event: SubmitEvent) => {
    event.preventDefault();

    const selected = selectedPerson();
    if (!selected) return;

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const nextName = String(formData.get('name') ?? '').trim();
    const nextFamilyId = String(formData.get('nuclearFamilyId') ?? '').trim();
    const nextDob = String(formData.get('dob') ?? '').trim();
    const nextPhone = String(formData.get('phone') ?? '').trim();

    if (!nextName || !nextFamilyId) {
      setPersonEditError('Name and nuclear family ID are required.');
      return;
    }

    const currentPeople = people().map((person) => normalizeRelationships(clonePerson(person)));
    const existingIds = new Set(currentPeople.map((person) => person.id));
    const currentPerson = currentPeople.find((person) => person.id === selected.id);

    if (!currentPerson) {
      setPersonEditError('This person no longer exists in the graph.');
      return;
    }

    const parents = unique(formData.getAll('parents').map((value) => String(value)));
    const children = unique(formData.getAll('children').map((value) => String(value)));
    const partners = unique(formData.getAll('partners').map((value) => String(value)));
    const referencedIds = [...parents, ...children, ...partners];
    const invalidReferences = referencedIds.filter((id) => id === selected.id || !existingIds.has(id));

    if (invalidReferences.length > 0) {
      setPersonEditError(`Unknown relationship selections: ${invalidReferences.join(', ')}`);
      return;
    }

    const editedPerson = normalizeRelationships({
      ...currentPerson,
      name: nextName,
      nuclearFamilyId: nextFamilyId,
      dob: nextDob || undefined,
      phone: nextPhone,
      relationships: {
        parents,
        children,
        partners
      }
    });

    const cleanedPeople = currentPeople.map((person) =>
      person.id === editedPerson.id ? editedPerson : removeRelationshipReference(person, editedPerson.id)
    );
    const normalizedPeople = applyReciprocalRelationships(cleanedPeople);
    const savedPeople = await savePeople(normalizedPeople, setPersonEditError);
    if (!savedPeople) return;

    setPersonEditError('');
    setPersonEditMode(false);

    window.setTimeout(() => {
      const editedNode = graphNodes.find((node) => node.id === editedPerson.id);
      if (!editedNode) return;

      setSelectedPerson(editedNode);
      focusNode(editedNode);
      flashNode(editedNode);
    }, 120);
  };

  onMount(() => {
    graph = ForceGraph3D()(container)
      .backgroundColor('#0f1711')
      .nodeLabel(
        (node: GraphNode) => `
          <div style="padding:8px 10px; background:rgba(19,29,20,0.94); border:1px solid rgba(167,146,117,0.28); border-radius:8px; color:#f3e9d2;">
            <div style="font-weight:700; margin-bottom:4px;">${node.name}</div>
            <div>Family: ${node.nuclearFamilyId}</div>
            <div>Birthday: ${formatBirthday(node.dob)}</div>
            <div>Phone: ${node.phone || 'Unknown'}</div>
            ${node.relationships.parents.length ? `<div>Parents: ${formatRelationshipNames(node.relationships.parents)}</div>` : ''}
            ${node.relationships.children.length ? `<div>Children: ${formatRelationshipNames(node.relationships.children)}</div>` : ''}
            ${node.relationships.partners.length ? `<div>Partners: ${formatRelationshipNames(node.relationships.partners)}</div>` : ''}
          </div>
        `
      )
      .nodeColor((node: GraphNode) => node.color)
      .nodeVal((node: GraphNode) => Math.max(4, node.connectionCount * 1.8))
      .linkColor((link: GraphLink) =>
        link.type === 'partner' ? 'rgba(204, 177, 139, 0.42)' : 'rgba(126, 155, 106, 0.34)'
      )
      .linkWidth((link: GraphLink) => (link.type === 'partner' ? 2.1 : 1.4))
      .linkOpacity(0.55)
      .showNavInfo(false)
      .enableNodeDrag(true)
      .onNodeClick((node: GraphNode) => {
        handleNodeSelection(node);
      });

    const resizeGraph = () => {
      graph?.width(container.clientWidth);
      graph?.height(container.clientHeight);
    };

    resizeGraph();
    window.addEventListener('resize', resizeGraph);
    setReady(true);

    onCleanup(() => {
      window.removeEventListener('resize', resizeGraph);
      for (const timerId of highlightTimers.values()) {
        window.clearTimeout(timerId);
      }
      highlightTimers.clear();
      graph?.pauseAnimation();
      container.innerHTML = '';
      graph = null;
    });
  });

  createEffect(() => {
    if (!graph) return;

    const graphData = buildGraphData({ people: people() });
    graphNodes = graphData.nodes;
    graph.graphData(graphData);
    graph.refresh();
  });

  return (
    <section class="family-graph-shell">
      <div class="family-title-panel">
        <div>
          <p class="eyebrow">Family Tree</p>
          <h1>{props.familyName}</h1>
        </div>
      </div>

      <form class="graph-search graph-search--overlay" onSubmit={handleSearch}>
        <label class="graph-search__field">
          <span class="graph-search__label">Search by name</span>
          <input
            ref={searchInput}
            class="graph-search__input"
            type="search"
            name="person-search"
            placeholder="Try Ava, Daniel, or Mia"
            disabled={!ready()}
            value={searchTerm()}
            onInput={(event) => {
              setSearchTerm(event.currentTarget.value);
              if (searchError()) setSearchError('');
            }}
          />
        </label>
        <button class="graph-search__button" type="submit" disabled={!ready()}>
          Search
        </button>

        <Show when={searchError()}>
          <p class="graph-search__error" role="status">
            {searchError()}
          </p>
        </Show>
      </form>

      <div class="graph-actions-panel">
        <p class="graph-actions-panel__label">Edit graph</p>
        <button class="graph-actions-panel__button" type="button" onClick={openAddDialog}>
          Add node
        </button>
        <p class="graph-actions-panel__status" aria-live="polite">
          {saveStatus()}
        </p>
      </div>

      <div class="birthday-panel">
        <div class="birthday-panel__header">
          <p class="birthday-panel__label">Upcoming birthdays</p>
          <button
            class="birthday-panel__toggle"
            type="button"
            aria-expanded={birthdaysExpanded()}
            aria-label={birthdaysExpanded() ? 'Collapse upcoming birthdays' : 'Expand upcoming birthdays'}
            onClick={() => setBirthdaysExpanded((expanded) => !expanded)}
          >
            {birthdaysExpanded() ? '▾' : '▸'}
          </button>
        </div>

        <div
          class={`birthday-panel__body ${birthdaysExpanded() ? 'birthday-panel__body--expanded' : ''}`}
          aria-hidden={!birthdaysExpanded()}
        >
          <div class="birthday-panel__body-inner">
            <Show
              when={upcomingBirthdays().length > 0}
              fallback={<p class="birthday-panel__empty">No birthdays available.</p>}
            >
              <ul class="birthday-panel__list">
                {upcomingBirthdays().map((person) => (
                  <li class="birthday-panel__item">
                    <div>
                      <p class="birthday-panel__name">{person.name}</p>
                      <p class="birthday-panel__date">{person.formattedDob}</p>
                    </div>
                    <p class="birthday-panel__offset">
                      {person.daysAway === 0 ? 'Today' : `${person.daysAway}d`}
                    </p>
                  </li>
                ))}
              </ul>
            </Show>
          </div>
        </div>
      </div>

      <div class="family-graph-stage">
        <Show when={!ready()}>
          <div class="graph-overlay">
            <div class="graph-spinner" />
            <p>Initializing 3D graph...</p>
          </div>
        </Show>
        <div ref={container} class="graph-canvas" />
      </div>

      <dialog
        ref={personDialog}
        class={`person-dialog ${personEditMode() ? 'person-dialog--wide' : ''}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closePersonDialog();
          }
        }}
        onClose={() => {
          setPersonEditMode(false);
          setPersonEditError('');
          setSelectedPerson(null);
        }}
      >
        <Show when={selectedPerson()}>
          {(person) => (
            <div class="person-dialog__content">
              <div class="person-dialog__header">
                <div>
                  <p class="person-dialog__eyebrow">Selected person</p>
                  <h2>{person().name}</h2>
                </div>
                <div class="person-dialog__actions">
                  <button
                    class="person-dialog__close"
                    type="button"
                    onClick={() => {
                      setPersonEditError('');
                      setPersonEditMode((editing) => !editing);
                    }}
                  >
                    {personEditMode() ? 'Cancel edit' : 'Edit'}
                  </button>
                  <button class="person-dialog__close" type="button" onClick={closePersonDialog}>
                    Close
                  </button>
                </div>
              </div>

              <Show
                when={personEditMode()}
                fallback={
                  <dl class="person-dialog__details">
                    <div>
                      <dt>Birthday</dt>
                      <dd>{formatBirthday(person().dob)}</dd>
                    </div>
                    <div>
                      <dt>Phone Number</dt>
                      <dd>{person().phone || 'Unknown'}</dd>
                    </div>
                    <div>
                      <dt>Parents</dt>
                      <dd>{formatRelationshipNames(person().relationships.parents) || 'None listed'}</dd>
                    </div>
                    <div>
                      <dt>Children</dt>
                      <dd>{formatRelationshipNames(person().relationships.children) || 'None listed'}</dd>
                    </div>
                    <div>
                      <dt>Partners</dt>
                      <dd>{formatRelationshipNames(person().relationships.partners) || 'None listed'}</dd>
                    </div>
                  </dl>
                }
              >
                <form class="person-edit-form" onSubmit={handleEditNode}>
                  <p class="person-dialog__note">
                    The node ID stays fixed. Leave the birthday blank when no full date of birth is known.
                  </p>

                  <div class="add-node-grid">
                    <label class="add-node-field">
                      <span>Name</span>
                      <input name="name" type="text" value={person().name} required />
                    </label>
                    <label class="add-node-field">
                      <span>Nuclear Family ID</span>
                      <input name="nuclearFamilyId" type="text" value={person().nuclearFamilyId} required />
                    </label>
                    <label class="add-node-field">
                      <span>Date of Birth</span>
                      <input name="dob" type="date" value={person().dob ?? ''} />
                    </label>
                    <label class="add-node-field">
                      <span>Phone Number</span>
                      <input name="phone" type="text" value={person().phone} />
                    </label>
                    <label class="add-node-field add-node-field--full">
                      <span>Parents</span>
                      <select name="parents" multiple size="5">
                        {people()
                          .filter((candidate) => candidate.id !== person().id)
                          .map((candidate) => (
                            <option
                              value={candidate.id}
                              selected={person().relationships.parents.includes(candidate.id)}
                            >
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label class="add-node-field add-node-field--full">
                      <span>Children</span>
                      <select name="children" multiple size="5">
                        {people()
                          .filter((candidate) => candidate.id !== person().id)
                          .map((candidate) => (
                            <option
                              value={candidate.id}
                              selected={person().relationships.children.includes(candidate.id)}
                            >
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label class="add-node-field add-node-field--full">
                      <span>Partners</span>
                      <select name="partners" multiple size="4">
                        {people()
                          .filter((candidate) => candidate.id !== person().id)
                          .map((candidate) => (
                            <option
                              value={candidate.id}
                              selected={person().relationships.partners.includes(candidate.id)}
                            >
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <Show when={personEditError()}>
                    <p class="graph-search__error" role="status">
                      {personEditError()}
                    </p>
                  </Show>

                  <div class="add-node-actions">
                    <button class="graph-actions-panel__button" type="submit" disabled={saving()}>
                      {saving() ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </form>
              </Show>
            </div>
          )}
        </Show>
      </dialog>

      <dialog
        ref={addDialog}
        class={`person-dialog person-dialog--wide ${addDialogClosing() ? 'person-dialog--closing' : ''}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeAddDialog();
          }
        }}
        onClose={() => {
          setAddDialogClosing(false);
        }}
      >
        <form ref={addForm} class="person-dialog__content" onSubmit={handleAddNode}>
          <div class="person-dialog__header">
            <div>
              <p class="person-dialog__eyebrow">Add family member</p>
              <h2>New node</h2>
            </div>
            <button class="person-dialog__close" type="button" onClick={closeAddDialog}>
              Close
            </button>
          </div>

          <p class="person-dialog__note">
            Person IDs are generated automatically. Choose existing parents, children, or partners from
            the current graph to create links.
          </p>

          <div class="add-node-grid">
            <label class="add-node-field">
              <span>Name</span>
              <input name="name" type="text" placeholder="Emma Smith" required />
            </label>
            <label class="add-node-field">
              <span>Nuclear Family ID</span>
              <input name="nuclearFamilyId" type="text" placeholder="smith-f004" required />
            </label>
            <label class="add-node-field">
              <span>Date of Birth</span>
              <input name="dob" type="date" />
            </label>
            <label class="add-node-field">
              <span>Phone Number</span>
              <input name="phone" type="text" placeholder="555-2208" />
            </label>
            <label class="add-node-field add-node-field--full">
              <span>Parents</span>
              <select name="parents" multiple size="5">
                {people().map((person) => (
                  <option value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label class="add-node-field add-node-field--full">
              <span>Children</span>
              <select name="children" multiple size="5">
                {people().map((person) => (
                  <option value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label class="add-node-field add-node-field--full">
              <span>Partners</span>
              <select name="partners" multiple size="4">
                {people().map((person) => (
                  <option value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
          </div>

          <Show when={addError()}>
            <p class="graph-search__error" role="status">
              {addError()}
            </p>
          </Show>

          <div class="add-node-actions">
            <button class="graph-actions-panel__button" type="submit" disabled={saving()}>
              {saving() ? 'Saving...' : 'Save node'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
