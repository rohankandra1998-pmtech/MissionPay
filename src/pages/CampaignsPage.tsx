import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CampaignCard } from "../components/CampaignCard";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { useCampaigns } from "../hooks/useCampaigns";

const categories = ["All", "Community", "Education", "Medical", "Environment", "Disaster relief", "Animal welfare"];

export function CampaignsPage() {
  const { campaigns, loading, error } = useCampaigns();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => campaigns.filter((campaign) => {
    const categoryMatch = category === "All" || campaign.category === category;
    const haystack = `${campaign.title} ${campaign.short_description} ${campaign.fundraiser.display_name}`.toLowerCase();
    return categoryMatch && haystack.includes(search.toLowerCase());
  }), [campaigns, category, search]);

  return (
    <main>
      <section className="page-hero page-hero--discover">
        <div className="container"><p className="eyebrow">Discover meaningful work</p><h1>Find the mission<br />that moves you.</h1><p>Clear goals, accountable organizers, and stories worth understanding before you give.</p></div>
      </section>
      <section className="chapter container">
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><span className="sr-only">Search campaigns</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by mission or organizer" /></label>
          <div className="category-filter" role="group" aria-label="Filter by category">
            {categories.map((item) => <button key={item} className={item === category ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
        </div>
        {loading && <LoadingState label="Loading campaigns" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && filtered.length === 0 && <EmptyState title="No missions match yet" message="Try a different search or category." />}
        <div className="campaign-grid campaign-grid--all">{filtered.map((campaign) => <CampaignCard campaign={campaign} key={campaign.id} />)}</div>
      </section>
    </main>
  );
}
