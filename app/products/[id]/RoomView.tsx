import Image from "next/image";

/**
 * "In a Room" view rendered with CSS — composites the painting onto the neutral
 * room photo at the wall region. Used for uploaded paintings, which don't have a
 * pre-generated mockup file. Wall rect is the same one used by
 * scripts/generate-mockups.js, expressed as % of the 1600×1068 room image.
 */
export default function RoomView({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: "1600 / 1068" }}>
      <Image
        src="/neutral-room.jpg"
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
      <div
        className="absolute"
        style={{ left: "31.25%", top: "14.98%", width: "25.625%", height: "28.09%" }}
      >
        {/* dark frame + mat with a soft drop shadow */}
        <div className="relative w-full h-full bg-[#2b2b2b] p-[4%] shadow-[0_10px_24px_rgba(0,0,0,0.4)]">
          <div className="relative w-full h-full bg-white">
            <Image src={src} alt={alt} fill className="object-contain" sizes="220px" />
          </div>
        </div>
      </div>
    </div>
  );
}
