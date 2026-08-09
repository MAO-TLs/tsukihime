import {useEffect} from "react"

interface MaoDocumentMetadataProps {
	title: string
	description: string
	canonicalPath?: string
}

interface AttributeSnapshot {
	element: Element
	attribute: string
	value: string | null
	created: boolean
}

export default function MaoDocumentMetadata({
	title,
	description,
	canonicalPath = window.location.pathname,
}: MaoDocumentMetadataProps) {
	useEffect(() => {
		const previousTitle = document.title
		const canonical = new URL(canonicalPath, window.location.origin).toString()
		const snapshots: AttributeSnapshot[] = []

		const setMeta = (selector: string, attribute: string, value: string, create: () => Element) => {
			let element = document.head.querySelector(selector)
			const created = !element
			if (!element) {
				element = create()
				document.head.append(element)
			}
			snapshots.push({element, attribute, value: element.getAttribute(attribute), created})
			element.setAttribute(attribute, value)
		}

		document.title = title
		setMeta('meta[name="description"]', "content", description, () => {
			const element = document.createElement("meta")
			element.setAttribute("name", "description")
			return element
		})
		setMeta('meta[property="og:title"]', "content", title, () => {
			const element = document.createElement("meta")
			element.setAttribute("property", "og:title")
			return element
		})
		setMeta('meta[property="og:description"]', "content", description, () => {
			const element = document.createElement("meta")
			element.setAttribute("property", "og:description")
			return element
		})
		setMeta('meta[property="og:url"]', "content", canonical, () => {
			const element = document.createElement("meta")
			element.setAttribute("property", "og:url")
			return element
		})
		setMeta('meta[name="twitter:title"]', "content", title, () => {
			const element = document.createElement("meta")
			element.setAttribute("name", "twitter:title")
			return element
		})
		setMeta('meta[name="twitter:description"]', "content", description, () => {
			const element = document.createElement("meta")
			element.setAttribute("name", "twitter:description")
			return element
		})
		setMeta('link[rel="canonical"]', "href", canonical, () => {
			const element = document.createElement("link")
			element.setAttribute("rel", "canonical")
			return element
		})

		return () => {
			document.title = previousTitle
			for (const snapshot of snapshots) {
				if (snapshot.created)
					snapshot.element.remove()
				else if (snapshot.value === null)
					snapshot.element.removeAttribute(snapshot.attribute)
				else
					snapshot.element.setAttribute(snapshot.attribute, snapshot.value)
			}
		}
	}, [canonicalPath, description, title])

	return null
}
