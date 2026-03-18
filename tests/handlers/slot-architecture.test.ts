import { describe, it, expect } from 'vitest';
import { analyzeSlotArchitecture } from '../../packages/core/src/handlers/analyzers/slot-architecture.js';
import type { CemDeclaration } from '../../packages/core/src/handlers/cem.js';

// ─── Helix-style Fixtures ──────────────────────────────────────────────────────
// Realistic slot architectures modeled after hx-card, hx-dialog, hx-drawer

const HX_CARD_DECL: CemDeclaration = {
  kind: 'class',
  name: 'HxCard',
  tagName: 'hx-card',
  description: 'A card component with flexible content areas.',
  members: [
    { kind: 'field', name: 'header', type: { text: 'string' }, description: 'Card header text.' },
    {
      kind: 'field',
      name: 'footer',
      type: { text: 'string' },
      description: 'Card footer text.',
    },
    { kind: 'field', name: 'variant', type: { text: 'string' }, description: 'Card variant.' },
  ],
  slots: [
    { name: '', description: 'Primary content area of the card.' },
    {
      name: 'header',
      description: 'Optional custom header content, overrides the heading attribute.',
    },
    {
      name: 'footer',
      description: 'Footer content such as actions or metadata.',
    },
    {
      name: 'media',
      description: 'Media content (<img> or <video> element) displayed above the card body.',
    },
  ],
};

const HX_DIALOG_DECL: CemDeclaration = {
  kind: 'class',
  name: 'HxDialog',
  tagName: 'hx-dialog',
  description:
    'A dialog component.\n@slot heading - The dialog heading, expects <h2> elements.\n@slot actions - Action buttons for the dialog.',
  members: [
    {
      kind: 'field',
      name: 'heading',
      type: { text: 'string' },
      description: 'The dialog heading text.',
    },
    {
      kind: 'field',
      name: 'open',
      type: { text: 'boolean' },
      description: 'Whether dialog is open.',
    },
    { kind: 'field', name: 'modal', type: { text: 'boolean' }, description: 'Modal behavior.' },
  ],
  slots: [
    { name: '', description: 'The dialog body content.' },
    { name: 'heading', description: 'A slot for the dialog heading.' },
    { name: 'footer', description: 'Footer area for action buttons.' },
    { name: 'hero', description: 'A decorative image at the top of the dialog.' },
  ],
};

const HX_DRAWER_DECL: CemDeclaration = {
  kind: 'class',
  name: 'HxDrawer',
  tagName: 'hx-drawer',
  description: 'A drawer/panel component with header and content areas.',
  members: [
    {
      kind: 'field',
      name: 'label',
      type: { text: 'string' },
      description: 'Drawer label for accessibility.',
    },
    { kind: 'field', name: 'open', type: { text: 'boolean' }, description: 'Open state.' },
    { kind: 'field', name: 'placement', type: { text: 'string' }, description: 'Placement side.' },
  ],
  slots: [
    { name: '', description: 'The drawer body content.' },
    { name: 'label', description: 'The drawer label content.' },
    { name: 'header', description: 'Custom header content for the drawer.' },
    { name: 'footer', description: 'Custom footer content for the drawer.' },
  ],
};

// ─── Spectrum-style Fixtures ───────────────────────────────────────────────────

const SP_DIALOG_DECL: CemDeclaration = {
  kind: 'class',
  name: 'SpDialog',
  tagName: 'sp-dialog',
  description: 'Spectrum dialog component.',
  members: [
    { kind: 'field', name: 'size', type: { text: 'string' }, description: 'Dialog size.' },
    { kind: 'field', name: 'dismissable', type: { text: 'boolean' } },
  ],
  slots: [
    { name: '', description: 'The content of the dialog.' },
    { name: 'heading', description: 'A slot for the heading of the dialog.' },
    { name: 'hero', description: 'A decorative image at the top of the dialog.' },
    { name: 'footer', description: 'Content for the footer area of the dialog.' },
    { name: 'button', description: 'Action buttons for the dialog footer.' },
  ],
};

const SP_TEXTFIELD_DECL: CemDeclaration = {
  kind: 'class',
  name: 'SpTextfield',
  tagName: 'sp-textfield',
  description: 'Spectrum text input component.',
  members: [
    { kind: 'field', name: 'value', type: { text: 'string' }, description: 'Input value.' },
    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'Visible label.' },
  ],
  slots: [
    {
      name: 'help-text',
      description: 'Default or non-negative help text to associate with your form element.',
    },
    {
      name: 'negative-help-text',
      description: 'Negative help text to associate with your form element when it is invalid.',
    },
  ],
};

// ─── Material-style Fixtures ───────────────────────────────────────────────────

const MD_DIALOG_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MdDialog',
  tagName: 'md-dialog',
  description: 'Material Design dialog component.',
  members: [
    { kind: 'field', name: 'open', type: { text: 'boolean' }, description: 'Open state.' },
    {
      kind: 'field',
      name: 'headline',
      type: { text: 'string' },
      description: 'Dialog headline text.',
    },
  ],
  slots: [
    { name: '', description: "The dialog's content." },
    { name: 'headline', description: "The dialog's headline." },
    { name: 'actions', description: "The dialog's action buttons." },
  ],
};

const MD_BUTTON_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MdFilledButton',
  tagName: 'md-filled-button',
  description: 'Material Design filled button.',
  members: [
    { kind: 'field', name: 'disabled', type: { text: 'boolean' }, description: 'Disabled state.' },
    { kind: 'field', name: 'icon', type: { text: 'string' }, description: 'Icon name to display.' },
  ],
  slots: [
    { name: '', description: "The button's label." },
    { name: 'icon', description: 'An optional <md-icon> element to display in the button.' },
  ],
};

// ─── Edge-case Fixtures ────────────────────────────────────────────────────────

const SLOT_LESS_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyBadge',
  tagName: 'my-badge',
  description: 'A simple badge with no slots.',
  members: [
    { kind: 'field', name: 'count', type: { text: 'number' }, description: 'Badge count.' },
  ],
};

const DEFAULT_ONLY_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyWrapper',
  tagName: 'my-wrapper',
  description: 'A simple wrapper.',
  slots: [{ name: '', description: 'The wrapped content.' }],
};

const UNDOCUMENTED_SLOTS_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyPoorDocs',
  tagName: 'my-poor-docs',
  description: 'Component with undocumented slots.',
  members: [
    { kind: 'field', name: 'label', type: { text: 'string' } },
    { kind: 'field', name: 'icon', type: { text: 'string' } },
  ],
  slots: [{ name: '' }, { name: 'label' }, { name: 'icon' }, { name: 'footer' }],
};

const PARTIAL_COHERENCE_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyPartial',
  tagName: 'my-partial',
  description: 'Component where only one side of coherence pair is documented.',
  members: [
    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'The label text.' },
    { kind: 'field', name: 'icon', type: { text: 'string' } }, // no description
  ],
  slots: [
    { name: '', description: 'Default content.' },
    { name: 'label' }, // no description, but property has description
    { name: 'icon', description: 'Icon slot for decorative elements.' }, // description, but property has none
  ],
};

const RESERVED_NAME_DECL: CemDeclaration = {
  kind: 'class',
  name: 'MyReserved',
  tagName: 'my-reserved',
  description: 'Component with reserved-name properties.',
  members: [
    { kind: 'field', name: 'class', type: { text: 'string' }, description: 'CSS class.' },
    { kind: 'field', name: 'label', type: { text: 'string' }, description: 'The label.' },
  ],
  // Slot named 'class' should not pair with the 'class' property (reserved)
  slots: [
    { name: '', description: 'Content.' },
    { name: 'class', description: 'Should not pair with reserved property.' },
    { name: 'label', description: 'Label content.' },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Slot Architecture Analyzer', () => {
  describe('null return for slot-less components', () => {
    it('returns null for presentational components with no slots', () => {
      const result = analyzeSlotArchitecture(SLOT_LESS_DECL);
      expect(result).toBeNull();
    });

    it('returns null when slots array is empty', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'Empty',
        tagName: 'empty-thing',
        slots: [],
      };
      expect(analyzeSlotArchitecture(decl)).toBeNull();
    });

    it('returns null when slots is undefined', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoSlots',
        tagName: 'no-slots',
      };
      expect(analyzeSlotArchitecture(decl)).toBeNull();
    });
  });

  describe('default slot scoring', () => {
    it('awards 25 points for default slot with description', () => {
      const result = analyzeSlotArchitecture(DEFAULT_ONLY_DECL);
      expect(result).not.toBeNull();
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(defaultMetric).toBeDefined();
      expect(defaultMetric!.score).toBe(25);
      expect(defaultMetric!.maxScore).toBe(25);
    });

    it('awards 15 points for default slot without description', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoDesc',
        tagName: 'no-desc',
        slots: [{ name: '' }],
      };
      const result = analyzeSlotArchitecture(decl);
      expect(result).not.toBeNull();
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(defaultMetric!.score).toBe(15);
    });

    it('awards 0 points when no default slot exists', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoDefault',
        tagName: 'no-default',
        slots: [
          { name: 'header', description: 'Header.' },
          { name: 'footer', description: 'Footer.' },
        ],
      };
      const result = analyzeSlotArchitecture(decl);
      expect(result).not.toBeNull();
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(defaultMetric!.score).toBe(0);
    });
  });

  describe('named slot documentation', () => {
    it('awards 30 points when all named slots are documented', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result).not.toBeNull();
      const namedMetric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(namedMetric!.score).toBe(30);
    });

    it('awards proportional points for partially documented named slots', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'PartialNamed',
        tagName: 'partial-named',
        slots: [
          { name: 'header', description: 'The header.' },
          { name: 'footer' }, // undocumented
          { name: 'sidebar' }, // undocumented
        ],
      };
      const result = analyzeSlotArchitecture(decl);
      expect(result).not.toBeNull();
      const namedMetric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      // 1 out of 3 named slots documented: round(1/3 * 30) = 10
      expect(namedMetric!.score).toBe(10);
    });

    it('awards full points when component has no named slots (trivially satisfied)', () => {
      const result = analyzeSlotArchitecture(DEFAULT_ONLY_DECL);
      expect(result).not.toBeNull();
      const namedMetric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(namedMetric!.score).toBe(30);
    });

    it('awards 0 when no named slots are documented', () => {
      const result = analyzeSlotArchitecture(UNDOCUMENTED_SLOTS_DECL);
      expect(result).not.toBeNull();
      const namedMetric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(namedMetric!.score).toBe(0);
    });
  });

  describe('slot type constraints', () => {
    it('detects element type mentions in slot descriptions', () => {
      // hx-card has 'media' slot with "<img> or <video> element" in description
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result).not.toBeNull();
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Slot type constraints');
      expect(typeMetric!.score).toBeGreaterThan(0);
    });

    it('detects JSDoc @slot annotations with type info from component description', () => {
      // hx-dialog description has @slot heading with "<h2> elements"
      const result = analyzeSlotArchitecture(HX_DIALOG_DECL);
      expect(result).not.toBeNull();
      const slots = result!.slots;
      const headingSlot = slots.find((s) => s.name === 'heading');
      expect(headingSlot!.hasTypeConstraint).toBe(true);
    });

    it('detects element type mentions like <md-icon>', () => {
      const result = analyzeSlotArchitecture(MD_BUTTON_DECL);
      expect(result).not.toBeNull();
      const iconSlot = result!.slots.find((s) => s.name === 'icon');
      expect(iconSlot!.hasTypeConstraint).toBe(true);
    });

    it('awards 0 when no slots have type constraints', () => {
      const decl: CemDeclaration = {
        kind: 'class',
        name: 'NoTypes',
        tagName: 'no-types',
        slots: [
          { name: '', description: 'Main content.' },
          { name: 'header', description: 'Header area.' },
        ],
      };
      const result = analyzeSlotArchitecture(decl);
      expect(result).not.toBeNull();
      const typeMetric = result!.subMetrics.find((m) => m.name === 'Slot type constraints');
      expect(typeMetric!.score).toBe(0);
    });
  });

  describe('slot-property coherence', () => {
    it('identifies coherence pairs for hx-card (header, footer)', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result).not.toBeNull();
      expect(result!.coherencePairs.length).toBe(2);
      const headerPair = result!.coherencePairs.find((p) => p.slotName === 'header');
      expect(headerPair).toBeDefined();
      expect(headerPair!.coherent).toBe(true);
      const footerPair = result!.coherencePairs.find((p) => p.slotName === 'footer');
      expect(footerPair).toBeDefined();
      expect(footerPair!.coherent).toBe(true);
    });

    it('identifies coherence pairs for md-dialog (headline)', () => {
      const result = analyzeSlotArchitecture(MD_DIALOG_DECL);
      expect(result).not.toBeNull();
      const headlinePair = result!.coherencePairs.find((p) => p.slotName === 'headline');
      expect(headlinePair).toBeDefined();
      expect(headlinePair!.coherent).toBe(true);
    });

    it('identifies coherence pairs for md-filled-button (icon)', () => {
      const result = analyzeSlotArchitecture(MD_BUTTON_DECL);
      expect(result).not.toBeNull();
      const iconPair = result!.coherencePairs.find((p) => p.slotName === 'icon');
      expect(iconPair).toBeDefined();
      expect(iconPair!.coherent).toBe(true);
    });

    it('awards partial points (50%) when only one side is documented', () => {
      // PARTIAL_COHERENCE_DECL: label slot undocumented but property documented,
      // icon slot documented but property undocumented
      const result = analyzeSlotArchitecture(PARTIAL_COHERENCE_DECL);
      expect(result).not.toBeNull();
      expect(result!.coherencePairs.length).toBe(2);

      const labelPair = result!.coherencePairs.find((p) => p.slotName === 'label');
      expect(labelPair!.slotDocumented).toBe(false);
      expect(labelPair!.propertyDocumented).toBe(true);
      expect(labelPair!.coherent).toBe(false);

      const iconPair = result!.coherencePairs.find((p) => p.slotName === 'icon');
      expect(iconPair!.slotDocumented).toBe(true);
      expect(iconPair!.propertyDocumented).toBe(false);
      expect(iconPair!.coherent).toBe(false);

      // Each pair gets 50% of (25/2) = 6.25, total = 12.5 → rounds to 13
      const coherenceMetric = result!.subMetrics.find((m) => m.name === 'Slot-property coherence');
      expect(coherenceMetric!.score).toBe(13);
    });

    it('skips coherence pairing for reserved/lifecycle property names', () => {
      const result = analyzeSlotArchitecture(RESERVED_NAME_DECL);
      expect(result).not.toBeNull();
      // 'class' slot should NOT pair with 'class' property (reserved)
      const classPair = result!.coherencePairs.find((p) => p.slotName === 'class');
      expect(classPair).toBeUndefined();
      // 'label' should still pair
      const labelPair = result!.coherencePairs.find((p) => p.slotName === 'label');
      expect(labelPair).toBeDefined();
      expect(labelPair!.coherent).toBe(true);
    });

    it('awards full coherence points when no pairs exist (trivially satisfied)', () => {
      // SP_TEXTFIELD_DECL: help-text and negative-help-text don't match any property names
      const result = analyzeSlotArchitecture(SP_TEXTFIELD_DECL);
      expect(result).not.toBeNull();
      expect(result!.coherencePairs.length).toBe(0);
      const coherenceMetric = result!.subMetrics.find((m) => m.name === 'Slot-property coherence');
      expect(coherenceMetric!.score).toBe(25);
    });
  });

  describe('total score calculation', () => {
    it('scores hx-card with rich slot architecture high', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result).not.toBeNull();
      // Default: 25, Named: 30, Type constraints > 0, Coherence: high
      expect(result!.score).toBeGreaterThanOrEqual(70);
    });

    it('scores fully documented default-only component at max', () => {
      const result = analyzeSlotArchitecture(DEFAULT_ONLY_DECL);
      expect(result).not.toBeNull();
      // Default: 25 + Named: 30 (trivial) + Type: 0 + Coherence: 25 (trivial) = 80
      expect(result!.score).toBe(80);
    });

    it('scores undocumented slots low', () => {
      const result = analyzeSlotArchitecture(UNDOCUMENTED_SLOTS_DECL);
      expect(result).not.toBeNull();
      // Default: 15 (no desc), Named: 0, Type: 0, Coherence: partial
      expect(result!.score).toBeLessThan(50);
    });

    it('caps total at 100', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result).not.toBeNull();
      expect(result!.score).toBeLessThanOrEqual(100);
    });
  });

  describe('confidence and structure', () => {
    it('returns verified confidence (pure CEM analysis)', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result!.confidence).toBe('verified');
    });

    it('returns 4 sub-metrics', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result!.subMetrics).toHaveLength(4);
    });

    it('includes slot analyses with correct structure', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result!.slots.length).toBe(4);
      for (const slot of result!.slots) {
        expect(slot).toHaveProperty('name');
        expect(slot).toHaveProperty('isDefault');
        expect(slot).toHaveProperty('hasDescription');
        expect(slot).toHaveProperty('hasTypeConstraint');
        expect(slot).toHaveProperty('matchingProperty');
      }
    });
  });

  describe('Spectrum component fixtures', () => {
    it('scores sp-dialog with 5 slots correctly', () => {
      const result = analyzeSlotArchitecture(SP_DIALOG_DECL);
      expect(result).not.toBeNull();
      expect(result!.slots.length).toBe(5);
      // All named slots documented
      const namedMetric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(namedMetric!.score).toBe(30);
    });

    it('scores sp-textfield with help-text slots', () => {
      const result = analyzeSlotArchitecture(SP_TEXTFIELD_DECL);
      expect(result).not.toBeNull();
      expect(result!.slots.length).toBe(2);
      // No default slot
      const defaultMetric = result!.subMetrics.find((m) => m.name === 'Default slot documentation');
      expect(defaultMetric!.score).toBe(0);
      // Both named slots documented
      const namedMetric = result!.subMetrics.find((m) => m.name === 'Named slot documentation');
      expect(namedMetric!.score).toBe(30);
    });
  });

  describe('Material component fixtures', () => {
    it('scores md-dialog with headline coherence pair', () => {
      const result = analyzeSlotArchitecture(MD_DIALOG_DECL);
      expect(result).not.toBeNull();
      expect(result!.slots.length).toBe(3);
      expect(result!.coherencePairs.length).toBeGreaterThanOrEqual(1);
    });

    it('scores md-filled-button with icon coherence pair', () => {
      const result = analyzeSlotArchitecture(MD_BUTTON_DECL);
      expect(result).not.toBeNull();
      expect(result!.slots.length).toBe(2);
      const iconPair = result!.coherencePairs.find((p) => p.slotName === 'icon');
      expect(iconPair).toBeDefined();
    });
  });

  describe('helix component fixtures', () => {
    it('scores hx-card with header/footer coherence pairs', () => {
      const result = analyzeSlotArchitecture(HX_CARD_DECL);
      expect(result).not.toBeNull();
      expect(result!.coherencePairs.length).toBe(2);
      expect(result!.coherencePairs.every((p) => p.coherent)).toBe(true);
    });

    it('scores hx-dialog with heading coherence pair', () => {
      const result = analyzeSlotArchitecture(HX_DIALOG_DECL);
      expect(result).not.toBeNull();
      const headingPair = result!.coherencePairs.find((p) => p.slotName === 'heading');
      expect(headingPair).toBeDefined();
      expect(headingPair!.coherent).toBe(true);
    });

    it('scores hx-drawer with label coherence pair', () => {
      const result = analyzeSlotArchitecture(HX_DRAWER_DECL);
      expect(result).not.toBeNull();
      const labelPair = result!.coherencePairs.find((p) => p.slotName === 'label');
      expect(labelPair).toBeDefined();
      expect(labelPair!.coherent).toBe(true);
    });
  });
});
