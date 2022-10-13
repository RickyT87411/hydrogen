import { json, type LoaderArgs } from "@remix-run/oxygen";
import { getFeaturedData } from "~/data";

export async function loader({ params }: LoaderArgs) {
  return json(await getFeaturedData({ params }));
}
