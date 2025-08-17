import axios from "axios";
import * as cheerio from 'cheerio'

class Data {
    url = "https://metanit.com"
}

class MetanitParser {
    private data: Data = new Data()
    private htmls: Map<string, string> = new Map()
    private tutorialLinks: string[] = []

    async getHtml(url: string) {
        if (!this.htmls.has(url)) {
            let result: string

            try {
                const { data: content } = await axios.get<string>(url)
                this.htmls.set(url, content)
                result = content
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`Ошибка при запросе ${url}: ${error.message}`)
                }
                throw error
            }

            return result
        } else {
            return this.htmls.get(url)
        }
    }

    async getTutorialLinks() {
        console.log("Получение ссылок руководств")

        if (this.tutorialLinks.length > 0) {
            console.log("Список ссылок не пустой, возврат результата")
            return this.tutorialLinks
        }

        let content: string

        try {
            const html = await this.getHtml(this.data.url)

            if (html) {
                content = html
            } else {
                throw Error()
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error("Не удалось получить ссылки. Ошибка выше")
            }
            throw error
        }

        const $ = cheerio.load(content)

        const $a = $('.navmenu > a')

        $a.each((index, element) => {
            // console.log(index, element.tagName)
            const href = $(element).attr('href')
            if (href) {
                const fullUrl = new URL(href, this.data.url).href
                this.tutorialLinks.push(fullUrl)
            }
        })

        return this.tutorialLinks
    }

    async run() {
        const links = await this.getTutorialLinks()
        console.log(links)
    }
}

const parser = new MetanitParser()
parser.run()