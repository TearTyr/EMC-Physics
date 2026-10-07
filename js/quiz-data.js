/* ==========================================================================
   Quiz question bank
   File: js/quiz-data.js   (loaded before js/quiz.js on quiz.html)

   20 multiple-choice questions across the four EMC topics (5 charges,
   6 current, 4 magnetism, 5 induction).
   Every question carries a worked explanation so the quiz doubles as a
   revision tool. Numerical answers were computed with k = 8.988e9 N m^2 C^-2.

   Schema
   ------
   {
     id       : number          stable identifier
     topic    : 'charges' | 'current' | 'magnetism' | 'induction'
     label    : string          human-readable topic name
     q        : string          stem (HTML allowed)
     options  : string[4]       choices
     answer   : number          index of the correct choice (0-based)
     explain  : string          feedback shown after grading (HTML allowed)
   }
   ========================================================================== */
window.EMC_QUIZ = [

  /* ---------------- Topic 1: electric charges and fields ---------------- */
  {
    id: 1, topic: 'charges', label: 'Charges & fields',
    q: 'Two point charges, +2 \u00B5C and \u22122 \u00B5C, are 0.30 m apart. What is the magnitude of the force between them? (k = 8.99\u00D710<sup>9</sup> N\u00B7m\u00B2/C\u00B2)',
    options: ['0.40 N, attractive', '0.40 N, repulsive', '4.0 N, attractive', '0.040 N, attractive'],
    answer: 0,
    explain: 'F = k|q<sub>1</sub>q<sub>2</sub>|/r\u00B2 = (8.99\u00D710<sup>9</sup>)(2\u00D710<sup>−6</sup>)(2\u00D710<sup>−6</sup>)/(0.30)\u00B2 = 0.399 \u2248 <b>0.40 N</b>. Opposite signs \u21D2 the force is <b>attractive</b>.'
  },
  {
    id: 2, topic: 'charges', label: 'Charges & fields',
    q: 'Electric field lines around an isolated NEGATIVE point charge\u2026',
    options: ['point radially outward from the charge', 'point radially inward toward the charge',
              'form closed circles around the charge', 'are parallel straight lines'],
    answer: 1,
    explain: 'By convention field lines start on positive charge and end on negative charge, so around a lone negative charge they point <b>radially inward</b>. A positive test charge placed nearby would be pulled toward it.'
  },
  {
    id: 3, topic: 'charges', label: 'Charges & fields',
    q: 'Two charges exert a force F on each other. The separation is doubled while the charges stay the same. The new force is:',
    options: ['F/4', 'F/2', '2F', '4F'],
    answer: 0,
    explain: 'Coulomb\u2019s law is an <b>inverse-square</b> law: F \u221D 1/r\u00B2. Doubling r divides F by 2\u00B2 = 4, so the force becomes <b>F/4</b>.'
  },
  {
    id: 4, topic: 'charges', label: 'Charges & fields',
    q: 'A proton is released from rest in a uniform electric field that points to the right. It will:',
    options: ['accelerate to the right', 'accelerate to the left',
              'move right at constant speed', 'stay where it is'],
    answer: 0,
    explain: 'F = qE and q > 0 for a proton, so the force is <b>along</b> E \u2014 to the right. Released from rest it <b>accelerates</b> (it does not move at constant speed, because a net force acts on it).'
  },
  {
    id: 5, topic: 'charges', label: 'Charges & fields',
    q: 'Which pair of units are both valid for electric field strength?',
    options: ['N/C and V/m', 'N\u00B7m and V\u00B7m', 'C/N and m/V', 'J/C and N\u00B7C'],
    answer: 0,
    explain: 'E = F/q gives <b>N/C</b>; E = V/d (uniform field) gives <b>V/m</b>. They are equivalent: 1 V/m = 1 J/(C\u00B7m) = 1 N/C. (J/C is the volt, not a field unit.)'
  },

  /* ---------------- Topic 2: current electricity ------------------------ */
  {
    id: 6, topic: 'current', label: 'Current electricity',
    q: 'A 12 V battery is connected across a 4 \u03A9 resistor. The current is:',
    options: ['48 A', '3 A', '0.33 A', '8 A'],
    answer: 1,
    explain: 'Ohm\u2019s law: I = V/R = 12/4 = <b>3 A</b>. (48 A comes from multiplying instead of dividing \u2014 the most common slip.)'
  },
  {
    id: 7, topic: 'current', label: 'Current electricity',
    q: 'Three resistors of 2 \u03A9, 3 \u03A9 and 5 \u03A9 are connected in SERIES. Their equivalent resistance is:',
    options: ['0.97 \u03A9', '10 \u03A9', '3.3 \u03A9', '30 \u03A9'],
    answer: 1,
    explain: 'Series resistances <b>add</b>: R<sub>eq</sub> = 2 + 3 + 5 = <b>10 \u03A9</b>. In series R<sub>eq</sub> is always larger than the largest single resistor.'
  },
  {
    id: 8, topic: 'current', label: 'Current electricity',
    q: 'A 6 \u03A9 and a 3 \u03A9 resistor are connected in PARALLEL. Their equivalent resistance is:',
    options: ['9 \u03A9', '4.5 \u03A9', '2 \u03A9', '18 \u03A9'],
    answer: 2,
    explain: '1/R<sub>eq</sub> = 1/6 + 1/3 = 1/6 + 2/6 = 3/6 = 1/2 \u21D2 R<sub>eq</sub> = <b>2 \u03A9</b>. In parallel R<sub>eq</sub> is always <b>smaller</b> than the smallest branch \u2014 adding a path makes it easier for current to flow.'
  },
  {
    id: 9, topic: 'current', label: 'Current electricity',
    q: 'In a series circuit containing several different resistors, which quantity is the SAME through every resistor?',
    options: ['the voltage across it', 'the current through it', 'the power it dissipates', 'the charge stored in it'],
    answer: 1,
    explain: 'There is only one path, so the <b>current is identical</b> everywhere (charge is conserved \u2014 Kirchhoff\u2019s current law). Voltages divide in proportion to R, so P = I\u00B2R differs too. Resistors do not store charge.'
  },
  {
    id: 10, topic: 'current', label: 'Current electricity',
    q: 'A 10 \u03A9 resistor carries a current of 2 A. The power it dissipates is:',
    options: ['5 W', '20 W', '40 W', '0.4 W'],
    answer: 2,
    explain: 'P = I\u00B2R = (2)\u00B2(10) = <b>40 W</b>. Equivalently V = IR = 20 V and P = VI = 20 \u00D7 2 = 40 W. That is far above a standard \u00BC W resistor \u2014 it would need a proper power resistor and a heat sink.'
  },
  {
    id: 11, topic: 'current', label: 'Current electricity',
    q: 'An ideal battery is connected to one resistor. A second resistor is then added in PARALLEL with the first. The total current supplied by the battery:',
    options: ['increases', 'decreases', 'stays the same', 'becomes zero'],
    answer: 0,
    explain: 'Adding a parallel path <b>lowers</b> the equivalent resistance, and I = V/R<sub>eq</sub> with V fixed, so the total current <b>increases</b>. Each branch still sees the full battery voltage. (This is why overloading a household circuit trips the breaker.)'
  },

  /* ---------------- Topic 3: magnetism ---------------------------------- */
  {
    id: 12, topic: 'magnetism', label: 'Magnetism',
    q: 'Outside a bar magnet, magnetic field lines run:',
    options: ['from the south pole to the north pole', 'from the north pole to the south pole',
              'only through the middle of the magnet', 'in straight lines that never curve'],
    answer: 1,
    explain: 'Outside the magnet the lines go <b>N \u2192 S</b>; inside the magnet they continue S \u2192 N, so every line is a <b>closed loop</b>. That is the graphical statement of \u201Cthere are no magnetic monopoles\u201D.'
  },
  {
    id: 13, topic: 'magnetism', label: 'Magnetism',
    q: 'A charged particle moves PARALLEL to a uniform magnetic field. The magnetic force on it is:',
    options: ['maximum', 'q v B', 'zero', 'perpendicular to the field'],
    answer: 2,
    explain: 'F = qvB sin\u03B8 and \u03B8 = 0\u00B0, so sin\u03B8 = 0 and <b>F = 0</b>. The particle continues in a straight line at constant speed. The force is largest when v \u22A5 B.'
  },
  {
    id: 14, topic: 'magnetism', label: 'Magnetism',
    q: 'A positive charge moves to the right (+x) through a magnetic field pointing OUT of the page (+z). The force on it points:',
    options: ['up (+y)', 'down (\u2212y)', 'to the right (+x)', 'out of the page (+z)'],
    answer: 1,
    explain: 'F = q v \u00D7 B. With v = x\u0302 and B = z\u0302: x\u0302 \u00D7 z\u0302 = \u2212y\u0302, so the force is <b>downward</b>. Right hand: fingers along v (right), curl them out of the page, and the thumb points down.'
  },
  {
    id: 15, topic: 'magnetism', label: 'Magnetism',
    q: 'A charged particle moves in a circle at constant speed in a uniform magnetic field. Which statement is correct?',
    options: ['The magnetic force does work on the particle, increasing its kinetic energy.',
              'The magnetic force is always perpendicular to the velocity, so it does no work and only changes the direction of motion.',
              'The particle must be accelerating in the direction of its velocity.',
              'The radius of the circle is independent of the particle\u2019s mass.'],
    answer: 1,
    explain: 'F = qv \u00D7 B is always \u22A5 v, so F\u00B7v = 0: <b>no work, no change in speed or kinetic energy</b> \u2014 the force only bends the path. The radius r = mv/(|q|B) certainly depends on mass, and the acceleration is centripetal (inward), never along v.'
  },

  /* ---------------- Topic 4: electromagnetic induction ------------------ */
  {
    id: 16, topic: 'induction', label: 'Electromagnetic induction',
    q: 'A coil of 200 turns has a magnetic flux through each turn changing at 0.05 Wb/s. The induced EMF is:',
    options: ['0.25 V', '10 V', '4000 V', '0.00025 V'],
    answer: 1,
    explain: 'Faraday\u2019s law: |EMF| = N\u00B7|d\u03A6/dt| = 200 \u00D7 0.05 = <b>10 V</b>. The EMF depends on the <b>rate of change</b> of flux, not on the flux itself.'
  },
  {
    id: 17, topic: 'induction', label: 'Electromagnetic induction',
    q: 'Lenz\u2019s law states that the induced current flows in a direction such that it:',
    options: ['reinforces the change in flux that produced it',
              'opposes the change in flux that produced it',
              'always flows clockwise',
              'makes the net flux through the coil zero'],
    answer: 1,
    explain: 'The induced current <b>opposes the change</b> that created it (that is the minus sign in EMF = \u2212Nd\u03A6/dt). It opposes the <i>change</i>, not the flux itself \u2014 so it cannot make the total flux zero. This is energy conservation in disguise: you must do mechanical work against the opposition.'
  },
  {
    id: 18, topic: 'induction', label: 'Electromagnetic induction',
    q: 'A bar magnet is pushed through a coil connected to a resistor. Which change would NOT alter the induced EMF?',
    options: ['Moving the magnet faster', 'Using a coil with more turns',
              'Using a stronger magnet', 'Increasing the resistance of the circuit'],
    answer: 3,
    explain: 'EMF = \u2212N d\u03A6/dt depends on turns, magnet strength and speed only. Changing <b>R</b> leaves the EMF alone but changes the induced <b>current</b> (I = EMF/R) and the power dissipated.'
  },
  {
    id: 19, topic: 'induction', label: 'Electromagnetic induction',
    q: 'A strong magnet dropped down a vertical copper tube falls much more slowly than it would in free fall. Why?',
    options: ['Copper is magnetic and attracts the magnet.',
              'The moving magnet induces eddy currents in the tube whose fields oppose the motion (Lenz\u2019s law).',
              'Air resistance inside the tube is much larger.',
              'The magnet loses its magnetism inside copper.'],
    answer: 1,
    explain: 'The falling magnet changes the flux through each part of the conducting tube, driving <b>eddy currents</b>. By Lenz\u2019s law their field opposes the relative motion, giving an upward drag force. The lost gravitational potential energy appears as heat (I\u00B2R) in the copper \u2014 the same principle used in eddy-current brakes.'
  },
  {
    id: 20, topic: 'induction', label: 'Electromagnetic induction',
    q: 'A bar magnet is held perfectly STILL at the centre of a coil connected to a galvanometer. The galvanometer reads:',
    options: ['a steady deflection, because the magnet is inside the coil',
              'zero, because the flux through the coil is not changing',
              'an alternating deflection, because the field lines are moving',
              'zero only if the coil has an even number of turns'],
    answer: 1,
    explain: 'A large, constant flux still gives d\u03A6/dt = 0, so <b>EMF = 0</b> and no current flows. Induction needs <b>change</b> \u2014 a stationary magnet inside a coil produces nothing, which is exactly why generators must rotate.'
  }
];
