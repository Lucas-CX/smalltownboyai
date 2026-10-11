import { danceSocialExamples } from '@/lib/dance-social-examples';
import { m } from '@/paraglide/messages.js';
import { SocialVideoGallery } from '@/components/social-video-gallery';

export function DanceSocialExamples() {
  const titles = {
    football: m['dance.social.football'](),
    pet_family: m['dance.social.pet_family'](),
    people: m['dance.social.people'](),
    louvre: m['dance.social.louvre'](),
    iron_man: m['dance.social.iron_man'](),
    art: m['dance.social.art'](),
  };
  return (
    <section
      id="social-examples"
      className="dance-trend dance-social"
      aria-labelledby="dance-social-title"
    >
      <h2 id="dance-social-title">{m['dance.social.title']()}</h2>
      <p>{m['dance.social.description']()}</p>
      <SocialVideoGallery
        items={danceSocialExamples.map((item) => ({
          ...item,
          title: titles[item.id],
        }))}
      />
    </section>
  );
}
