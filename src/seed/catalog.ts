/** Fictional demonstration catalog. Titles, authors and publishers are invented for LIBRAX. */
export interface SeedBook {
  title: string;
  subtitle?: string;
  authors: string[];
  publisher: string;
  year: number;
  category: string;
  pages: number;
  language?: string;
  edition?: string;
  tags: string[];
  description: string;
  featured?: boolean;
}

const MAP = 'Meridian Academic Press';
const NW = 'Northfield & Wray';
const HAL = 'Halcyon Books';
const QL = 'Quarry Lane Press';
const AUP = 'Atlas University Press';

export const SEED_BOOKS: SeedBook[] = [
  { title: 'Foundations of Distributed Systems', subtitle: 'Consistency, Consensus and Failure', authors: ['Ira Venkataraman'], publisher: MAP, year: 2021, category: 'Computer Science', pages: 512, edition: '2nd', tags: ['systems', 'networks', 'consensus'], featured: true,
    description: 'A rigorous, example-led treatment of replication, clocks, consensus protocols and the trade-offs behind every large-scale service. Each chapter closes with failure drills drawn from real outages.' },
  { title: 'The Patient Compiler', subtitle: 'Building Language Tools from Scratch', authors: ['Mara Lindqvist', 'Tobias Ferreira'], publisher: NW, year: 2019, category: 'Computer Science', pages: 438, tags: ['compilers', 'programming languages'],
    description: 'Walks through lexing, parsing, type checking and code generation by building a small but complete language, explaining each design decision along the way.' },
  { title: 'Data Structures in Practice', authors: ['Kwame Asante'], publisher: AUP, year: 2022, category: 'Computer Science', pages: 366, edition: '3rd', tags: ['algorithms', 'data structures', 'interviews'],
    description: 'Arrays to tries, heaps to skip lists — every structure is introduced with the problem it solves, its costs, and a benchmark against its rivals.' },
  { title: 'Learning Machines', subtitle: 'A Practitioner’s Introduction', authors: ['Ananya Rao'], publisher: MAP, year: 2023, category: 'Computer Science', pages: 480, tags: ['machine learning', 'statistics', 'ai'], featured: true,
    description: 'From linear models to modern neural networks, with an emphasis on evaluation, data quality and the habits that make models trustworthy in production.' },
  { title: 'Secure by Design', authors: ['Dmitri Halvorsen', 'Leah Okonjo'], publisher: QL, year: 2020, category: 'Computer Science', pages: 324, tags: ['security', 'software engineering'],
    description: 'Threat modelling, least privilege and safe defaults explained through case studies of systems that failed — and the small design choices that would have saved them.' },
  { title: 'Linear Algebra Illuminated', authors: ['Sofia Marchetti'], publisher: AUP, year: 2018, category: 'Mathematics', pages: 402, edition: '4th', tags: ['linear algebra', 'matrices'], featured: true,
    description: 'Geometric intuition first, formalism second. Vector spaces, eigenvalues and decompositions are built up with hundreds of diagrams and worked problems.' },
  { title: 'Probability Without Tears', authors: ['Hamid Qureshi'], publisher: HAL, year: 2017, category: 'Mathematics', pages: 288, tags: ['probability', 'statistics'],
    description: 'A friendly path through random variables, conditional probability and limit theorems, with puzzles that reward careful thinking.' },
  { title: 'The Calculus Workshop', authors: ['Beatrix Coleman'], publisher: NW, year: 2015, category: 'Mathematics', pages: 610, edition: '5th', tags: ['calculus', 'analysis'],
    description: 'Single and multivariable calculus taught as a workshop: short explanations, many exercises, and fully worked solutions for self-study.' },
  { title: 'Graphs and Networks', subtitle: 'Theory and Applications', authors: ['Kwame Asante', 'Lin Zhao'], publisher: MAP, year: 2020, category: 'Mathematics', pages: 344, tags: ['graph theory', 'networks', 'algorithms'],
    description: 'Connectivity, flows, colourings and random graphs, linked throughout to transport, social and computer networks.' },
  { title: 'Quantum Mechanics for the Curious', authors: ['Elena Vasquez'], publisher: HAL, year: 2021, category: 'Physics', pages: 296, tags: ['quantum', 'modern physics'], featured: true,
    description: 'An honest introduction to superposition, measurement and entanglement that keeps the mathematics light but never hand-waves the physics.' },
  { title: 'Classical Mechanics', subtitle: 'From Newton to Hamilton', authors: ['Rafael Moreau'], publisher: AUP, year: 2016, category: 'Physics', pages: 528, edition: '2nd', tags: ['mechanics', 'lagrangian'],
    description: 'A graduate-ready bridge from Newtonian mechanics to Lagrangian and Hamiltonian formulations, rich in problems.' },
  { title: 'Light, Heat and Motion', authors: ['Priyanka Iyer'], publisher: QL, year: 2019, category: 'Physics', pages: 312, tags: ['thermodynamics', 'optics'],
    description: 'Thermodynamics and optics explained through everyday phenomena, from boiling kettles to rainbows.' },
  { title: 'The Salt Road', authors: ['Noor Haddad'], publisher: HAL, year: 2018, category: 'Literature', pages: 384, tags: ['novel', 'historical fiction', 'travel'], featured: true,
    description: 'A caravan crosses the desert in a season of drought, and a young cartographer must choose between the map she was hired to draw and the people it would endanger.' },
  { title: 'Rooms Full of Rain', authors: ['Callum Brightwater'], publisher: NW, year: 2022, category: 'Literature', pages: 256, tags: ['novel', 'family'],
    description: 'Three siblings return to their grandmother’s coastal house for one last monsoon, and the secrets the house has kept begin to surface.' },
  { title: 'Small Hours', subtitle: 'Stories', authors: ['Ayesha Raman'], publisher: QL, year: 2020, category: 'Literature', pages: 212, tags: ['short stories', 'city'],
    description: 'Fourteen stories set between midnight and dawn in a sprawling city — night-shift nurses, insomniac poets and a lost dog with somewhere to be.' },
  { title: 'The Clockmaker’s Apprentice', authors: ['Felix Arden'], publisher: HAL, year: 2015, category: 'Literature', pages: 344, tags: ['novel', 'mystery'],
    description: 'In a mountain town where every clock stops at the same minute each year, an apprentice sets out to learn why.' },
  { title: 'Empires of the Monsoon', subtitle: 'Trade and Power in the Indian Ocean', authors: ['Tara Mukherjee'], publisher: AUP, year: 2017, category: 'History', pages: 456, tags: ['maritime history', 'trade', 'asia'], featured: true,
    description: 'Two thousand years of ports, ships and merchants, showing how seasonal winds shaped politics and culture across three continents.' },
  { title: 'The Printing Revolution', authors: ['Gregor Albrecht'], publisher: MAP, year: 2014, category: 'History', pages: 330, tags: ['media', 'europe', 'technology'],
    description: 'How movable type changed religion, science and politics — and what it suggests about our own information age.' },
  { title: 'Cities of Water', authors: ['Lucia Bernardi'], publisher: NW, year: 2021, category: 'History', pages: 290, tags: ['urban history', 'engineering'],
    description: 'A history of the canals, aqueducts and stepwells that made great cities possible.' },
  { title: 'Markets and Minds', subtitle: 'An Introduction to Behavioural Economics', authors: ['Daniel Osei'], publisher: QL, year: 2022, category: 'Economics', pages: 318, tags: ['behavioural economics', 'psychology'],
    description: 'Why people save too little, overpay for insurance and love free shipping — with the experiments that revealed it.' },
  { title: 'Principles of Macroeconomics', authors: ['Hannah Weiss', 'Arjun Kapoor'], publisher: AUP, year: 2020, category: 'Economics', pages: 702, edition: '7th', tags: ['macroeconomics', 'policy'],
    description: 'Growth, inflation, unemployment and policy explained with current data and accessible models.' },
  { title: 'The Economics of Cities', authors: ['Arjun Kapoor'], publisher: MAP, year: 2019, category: 'Economics', pages: 276, tags: ['urban economics', 'housing'],
    description: 'Agglomeration, housing markets and transport — why cities exist and how policy shapes them.' },
  { title: 'Grid Systems Reconsidered', authors: ['Jonas Eklund'], publisher: HAL, year: 2016, category: 'Design', pages: 224, tags: ['typography', 'layout', 'graphic design'],
    description: 'A modern look at the grid in editorial and interface design, with fifty annotated layouts.' },
  { title: 'Designing for Humans', subtitle: 'Research, Prototyping and Craft', authors: ['Mei Tanaka'], publisher: NW, year: 2023, category: 'Design', pages: 352, tags: ['ux', 'research', 'interaction design'], featured: true,
    description: 'A practical handbook for interaction designers: interviewing users, prototyping quickly, and turning findings into decisions.' },
  { title: 'The Colour Handbook', authors: ['Imogen Price'], publisher: QL, year: 2018, category: 'Design', pages: 198, tags: ['colour', 'graphic design'],
    description: 'Colour theory for designers, from perception and contrast to accessible palettes.' },
  { title: 'Questions That Matter', subtitle: 'An Introduction to Philosophy', authors: ['Samuel Adeyemi'], publisher: AUP, year: 2019, category: 'Philosophy', pages: 310, tags: ['ethics', 'epistemology', 'introduction'],
    description: 'Knowledge, mind, freedom and justice introduced through the questions students actually ask.' },
  { title: 'Ethics for Engineers', authors: ['Leah Okonjo'], publisher: MAP, year: 2021, category: 'Philosophy', pages: 236, tags: ['ethics', 'engineering', 'technology'],
    description: 'Responsibility, risk and professional judgement, through case studies from bridges to algorithms.' },
  { title: 'The Living Cell', authors: ['Ravi Shankar', 'Elena Vasquez'], publisher: HAL, year: 2020, category: 'Biology', pages: 590, edition: '3rd', tags: ['cell biology', 'molecular biology'],
    description: 'A richly illustrated tour of cellular machinery, from membranes and organelles to signalling and division.' },
  { title: 'Ecology of the Western Ghats', authors: ['Kavya Nair'], publisher: QL, year: 2022, category: 'Biology', pages: 284, tags: ['ecology', 'biodiversity', 'india'],
    description: 'Field-based ecology of one of the world’s biodiversity hotspots, with notes on conservation practice.' },
  { title: 'Genes and Evolution', authors: ['Ravi Shankar'], publisher: AUP, year: 2017, category: 'Biology', pages: 420, tags: ['genetics', 'evolution'],
    description: 'Mendel to genomics: how heredity works and how populations change over time.' },
  { title: 'Structures', subtitle: 'Why Things Stand Up', authors: ['Oliver Grant'], publisher: NW, year: 2016, category: 'Engineering', pages: 300, tags: ['structural engineering', 'materials'],
    description: 'Beams, arches, shells and cables explained without heavy mathematics — a classic-style introduction to how structures carry load.' },
  { title: 'Signals and Systems', authors: ['Nadia Petrova'], publisher: MAP, year: 2018, category: 'Engineering', pages: 640, edition: '2nd', tags: ['signal processing', 'electrical engineering'],
    description: 'Continuous and discrete-time systems, Fourier and Laplace transforms, and filtering, with computational exercises.' },
  { title: 'Renewable Energy Engineering', authors: ['Ahmed Farouk', 'Nadia Petrova'], publisher: AUP, year: 2023, category: 'Engineering', pages: 468, tags: ['energy', 'sustainability', 'power systems'],
    description: 'Solar, wind, storage and grid integration — the engineering behind the energy transition.' },
  { title: 'Introducción a la Programación', authors: ['Carmen Ortiz'], publisher: QL, year: 2021, category: 'Computer Science', pages: 260, language: 'Spanish', tags: ['programming', 'beginners'],
    description: 'Un curso introductorio de programación con ejercicios graduados y ejemplos claros.' },
];

export const SEED_MEMBERS: { name: string; type: 'student' | 'faculty' | 'staff'; department: string; status?: 'inactive' | 'suspended'; phone?: string }[] = [
  { name: 'Riya Sharma', type: 'student', department: 'Computer Science' },
  { name: 'Daniel Mensah', type: 'student', department: 'Mathematics' },
  { name: 'Aiko Watanabe', type: 'student', department: 'Design' },
  { name: 'Omar Khalil', type: 'student', department: 'Economics' },
  { name: 'Isabela Costa', type: 'student', department: 'Biology' },
  { name: 'Vikram Pillai', type: 'student', department: 'Engineering' },
  { name: 'Grace O’Neill', type: 'student', department: 'Literature' },
  { name: 'Mateo Rossi', type: 'student', department: 'Physics' },
  { name: 'Zainab Bello', type: 'student', department: 'History' },
  { name: 'Lukas Becker', type: 'student', department: 'Computer Science' },
  { name: 'Meera Joshi', type: 'student', department: 'Philosophy', status: 'inactive' },
  { name: 'Ethan Park', type: 'student', department: 'Engineering', status: 'suspended' },
  { name: 'Dr. Helen Achterberg', type: 'faculty', department: 'Computer Science' },
  { name: 'Prof. Sunil Varma', type: 'faculty', department: 'Economics' },
  { name: 'Dr. Amara Nwosu', type: 'faculty', department: 'Biology' },
  { name: 'Prof. Clara Jensen', type: 'faculty', department: 'History' },
  { name: 'Tomás Rivera', type: 'staff', department: 'Administration' },
  { name: 'Nisha Rao', type: 'staff', department: 'Library Services' },
];
